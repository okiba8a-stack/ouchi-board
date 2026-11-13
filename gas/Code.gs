/**
 * おうちボード 裏方（Google Apps Script ウェブアプリ）
 *
 * 使い方は docs/設定手順.md を参照。
 * 1. このファイルを Apps Script に貼り付ける
 * 2. 関数 setup を一度実行（権限を許可）→ ログに合言葉が出る
 * 3. デプロイ → ウェブアプリ（実行：自分／アクセス：全員）
 */

const PLACE = '東京都日野市';
const LAT = 35.6713;
const LON = 139.3951;
const TZ = 'Asia/Tokyo';
const NEWS_RSS = 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja';

/* ---------- 初回設定 ---------- */

function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('KEY', key);
  }
  const ss = getSheet_();
  // カレンダーと外部通信の権限をここで確認しておく
  CalendarApp.getDefaultCalendar().getName();
  UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=35&longitude=139&daily=weather_code&forecast_days=1');
  getReminderCal_(true);
  const folder = getPhotoFolder_(true);
  Logger.log('写真フォルダ（ここに入れた写真がボードに出ます）: ' + folder.getUrl());
  Logger.log('合言葉（key）: ' + key);
  Logger.log('データのスプレッドシート: ' + ss.getUrl());
}

/** 合言葉を作り直したいときに実行する */
function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('KEY');
  setup();
}

function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 消されていたら作り直す */ }
  }
  const ss = SpreadsheetApp.create('おうちボード データ');
  const r = ss.getSheets()[0];
  r.setName('routines');
  r.getRange(1, 1, 4, 5).setValues([
    ['id', '名前', '曜日（空欄か「毎日」、または「月火水」のように）', '並び順', '使う（FALSEで休止）'],
    ['bath', '風呂掃除', '毎日', 1, true],
    ['dishes', '皿洗い', '月火水', 2, true],
    ['laundry', '洗濯', '月火水', 3, true],
  ]);
  r.setFrozenRows(1);
  r.autoResizeColumns(1, 5);
  const c = ss.insertSheet('checks');
  c.getRange(1, 1, 1, 4).setValues([['日付', 'id', 'チェック', '更新']]);
  c.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

/* ---------- 入口 ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || p.key !== key) return json_({ ok: false, error: 'bad_key' });
  try {
    switch (p.action) {
      case 'board': return json_(board_(p.date));
      case 'check': return json_(check_(p.date, p.id, p.on === '1'));
      case 'remind': return json_(remind_(p.title, p.start, Number(p.minutes || 30)));
      case 'done': return json_(remindDone_(p.id));
      case 'event': return json_(event_(p.title, p.start, p.allday === '1', p.date));
      case 'photo': return json_(photo_(p.id));
      case 'ping': return json_({ ok: true });
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- まとめて返す ---------- */

function board_(dateStr) {
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const weather = safe_(getWeather_);
  return {
    ok: true,
    date: date,
    place: PLACE,
    events: safe_(() => getEvents_(date)),
    reminders: safe_(() => getReminders_(date)) || [],
    weather: weather,
    comment: weather ? comment_(weather) : '',
    news: safe_(getNews_),
    routines: getRoutines_(),
    checks: getChecks_(date),
    photos: safe_(getPhotoIds_) || [],
    at: new Date().toISOString(),
  };
}

function safe_(fn) {
  try { return fn(); } catch (e) { console.error(e); return null; }
}

/* ---------- カレンダー ---------- */

function getEvents_(date) {
  const start = new Date(date + 'T00:00:00+09:00');
  const end = new Date(start.getTime() + 8 * 86400000);
  const seen = {};
  const out = [];
  const remId = PropertiesService.getScriptProperties().getProperty('REMIND_CAL_ID');
  CalendarApp.getAllCalendars().forEach((cal) => {
    if (cal.isHidden() || cal.getId() === remId) return;
    cal.getEvents(start, end).forEach((ev) => {
      const allDay = ev.isAllDayEvent();
      const s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      const en = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
      const k = ev.getId() + '|' + s.getTime();
      if (seen[k]) return;
      seen[k] = true;
      out.push({
        title: ev.getTitle(),
        allDay: allDay,
        start: allDay ? Utilities.formatDate(s, TZ, 'yyyy-MM-dd') : s.toISOString(),
        end: allDay ? Utilities.formatDate(en, TZ, 'yyyy-MM-dd') : en.toISOString(),
        location: ev.getLocation() || '',
        calendar: cal.getName(),
      });
    });
  });
  return out;
}

/** 「リマインダー」：通知つきの予定を、専用のカレンダー「リマインダー」に作る（ふつうの予定と分けるため） */
function remind_(title, startIso, minutes) {
  title = String(title || '').trim();
  if (!title) throw new Error('内容が空です');
  const start = new Date(startIso);
  if (isNaN(start)) throw new Error('日時が読めません');
  const end = new Date(start.getTime() + Math.max(5, Math.min(minutes || 30, 600)) * 60000);
  const ev = getReminderCal_(true).createEvent(title, start, end, { description: 'おうちボードから登録' });
  ev.removeAllReminders();
  ev.addPopupReminder(0);
  return { ok: true, title: title, start: start.toISOString() };
}

/* ---------- 天気（Open-Meteo） ---------- */

function getWeather_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('weather');
  if (hit) return JSON.parse(hit);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&timezone=Asia%2FTokyo&forecast_days=3';
  const d = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  const day = (i) => d.daily && d.daily.time[i] ? {
    date: d.daily.time[i],
    code: d.daily.weather_code[i],
    max: d.daily.temperature_2m_max[i],
    min: d.daily.temperature_2m_min[i],
    pop: d.daily.precipitation_probability_max[i],
  } : null;
  const hours = (d.hourly && d.hourly.time || []).map((t, i) => ({
    time: t,
    code: d.hourly.weather_code[i],
    temp: d.hourly.temperature_2m[i],
    pop: d.hourly.precipitation_probability[i],
  }));
  const w = { today: day(0), tomorrow: day(1), hours: hours, fetchedAt: new Date().toISOString() };
  cache.put('weather', JSON.stringify(w), 30 * 60);
  return w;
}

/** 天気から決まった文で「ひとこと」を作る（独自の予報はしない） */
function comment_(w) {
  const t = w.today;
  if (!t) return '';
  const parts = [];
  if (t.pop >= 50) parts.push('雨の予報なので傘を持って出かけましょう');
  else if (t.pop >= 30) parts.push('降水確率' + t.pop + '%、折りたたみ傘があると安心です');
  else parts.push('傘はいらなそうです');
  if (t.max >= 30) parts.push('暑くなるので水分をこまめに');
  else if (t.max - t.min >= 10) parts.push('朝晩と日中の気温差が大きいので、羽織るものを一枚');
  else if (t.min <= 5) parts.push('朝は冷えるので暖かくして');
  const n = w.tomorrow;
  if (n && n.pop >= 50 && t.pop < 50) parts.push('あしたは雨の予報です');
  return parts.join('。') + '。';
}

/* ---------- ニュース（Google ニュース RSS・個人利用） ---------- */

function getNews_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('news');
  if (hit) return JSON.parse(hit);
  const xml = UrlFetchApp.fetch(NEWS_RSS).getContentText();
  const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');
  const news = items.slice(0, 8).map((it) => {
    const source = it.getChildText('source') || '';
    let title = it.getChildText('title') || '';
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    return { title: title, url: it.getChildText('link') || '', source: source };
  });
  cache.put('news', JSON.stringify(news), 60 * 60);
  return news;
}

/* ---------- ルーティン ---------- */

const DOW = '日月火水木金土';

function getRoutines_() {
  const rows = getSheet_().getSheetByName('routines').getDataRange().getValues().slice(1);
  return rows.filter((r) => r[0] && r[1]).map((r) => {
    const daysText = String(r[2] || '').trim();
    const days = daysText === '' || daysText === '毎日' ? [] :
      daysText.split('').map((ch) => DOW.indexOf(ch)).filter((i) => i >= 0);
    return { id: String(r[0]), title: String(r[1]), days: days, order: Number(r[3]) || 99, active: r[4] !== false && String(r[4]).toUpperCase() !== 'FALSE' };
  });
}

function getChecks_(date) {
  const rows = getSheet_().getSheetByName('checks').getDataRange().getValues().slice(1);
  const out = {};
  rows.forEach((r) => {
    const d = r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') : String(r[0]);
    if (d === date) out[String(r[1])] = r[2] === true || String(r[2]).toUpperCase() === 'TRUE';
  });
  return out;
}

function check_(date, id, on) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !id) throw new Error('date と id が必要です');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_().getSheetByName('checks');
    const values = sh.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < values.length; i++) {
      const d = values[i][0] instanceof Date ? Utilities.formatDate(values[i][0], TZ, 'yyyy-MM-dd') : String(values[i][0]);
      if (d === date && String(values[i][1]) === id) { row = i + 1; break; }
    }
    // 日付は文字列のまま残す（自動で日付型にされないよう先頭に ' を付ける）
    const rec = ["'" + date, id, on, new Date()];
    if (row > 0) sh.getRange(row, 1, 1, 4).setValues([rec]);
    else sh.appendRow(rec);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, checks: getChecks_(date) };
}

/* ---------- 写真（Google ドライブのフォルダ「おうちボード 写真」） ---------- */

function getPhotoFolder_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* 作り直す */ }
  }
  if (!create) return null;
  const folder = DriveApp.createFolder('おうちボード 写真');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function getPhotoIds_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('photos');
  if (hit) return JSON.parse(hit);
  const folder = getPhotoFolder_(false);
  const ids = [];
  if (folder) {
    const it = folder.getFiles();
    while (it.hasNext() && ids.length < 300) {
      const f = it.next();
      if (String(f.getMimeType()).indexOf('image/') === 0) ids.push(f.getId());
    }
  }
  cache.put('photos', JSON.stringify(ids), 10 * 60);
  return ids;
}

/** 写真1枚を、画面に合う大きさ（長辺1600px）の画像データで返す */
function photo_(id) {
  if (getPhotoIds_().indexOf(id) < 0) throw new Error('写真が見つかりません');
  const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  let blob = null;
  try {
    const meta = JSON.parse(UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink', { headers: auth }).getContentText());
    if (meta.thumbnailLink) {
      const url = meta.thumbnailLink.replace(/=s\d+.*$/, '=s1600');
      let res = UrlFetchApp.fetch(url, { headers: auth, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) blob = res.getBlob();
    }
  } catch (e) { console.error(e); }
  if (!blob) {
    // 縮小版が取れないときは元の画像（大きすぎるもの・HEIC は出せない）
    const f = DriveApp.getFileById(id);
    if (f.getSize() > 6 * 1024 * 1024 || !/image\/(jpeg|png|webp|gif)/.test(f.getMimeType())) throw new Error('この写真は表示できません');
    blob = f.getBlob();
  }
  return { ok: true, id: id, data: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- リマインダー専用のカレンダー ---------- */

function getReminderCal_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('REMIND_CAL_ID');
  if (id) {
    const cal = CalendarApp.getCalendarById(id);
    if (cal) return cal;
  }
  if (!create) return null;
  const cal = CalendarApp.createCalendar('リマインダー', { timeZone: TZ });
  props.setProperty('REMIND_CAL_ID', cal.getId());
  return cal;
}

/** 1週間前（過ぎたのに済みにしていないもの）から120日先までのリマインダー */
function getReminders_(date) {
  const cal = getReminderCal_(false);
  if (!cal) return [];
  const day0 = new Date(date + 'T00:00:00+09:00');
  return cal.getEvents(new Date(day0.getTime() - 7 * 86400000), new Date(day0.getTime() + 120 * 86400000)).map((ev) => ({
    id: ev.getId(),
    title: ev.getTitle(),
    start: ev.getStartTime().toISOString(),
  }));
}

/** 済みにしたリマインダーを消す（専用カレンダーの中のものだけ） */
function remindDone_(id) {
  const cal = getReminderCal_(false);
  const ev = cal && id ? cal.getEventById(id) : null;
  if (!ev) throw new Error('リマインダーが見つかりません');
  ev.deleteEvent();
  return { ok: true };
}

/* ---------- 予定の追加（メインのカレンダー） ---------- */

function event_(title, startIso, allDay, date) {
  title = String(title || '').trim();
  if (!title) throw new Error('内容が空です');
  const cal = CalendarApp.getDefaultCalendar();
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日付が読めません');
    // 正午を渡して、時差で日付がずれないようにする
    cal.createAllDayEvent(title, new Date(date + 'T12:00:00+09:00'));
  } else {
    const start = new Date(startIso);
    if (isNaN(start)) throw new Error('日時が読めません');
    cal.createEvent(title, start, new Date(start.getTime() + 60 * 60000));
  }
  return { ok: true, title: title };
}
