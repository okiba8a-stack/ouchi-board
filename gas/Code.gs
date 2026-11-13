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
// アシスタントに Claude を使うときのモデル（スクリプトプロパティ ANTHROPIC_API_KEY を入れたときだけ使う）
const CLAUDE_MODEL = 'claude-opus-5-5';

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
      case 'mark': return json_(remindMark_(p.id, p.on === '1'));
      case 'scenic': return json_(scenic_());
      case 'say': return json_(say_(p.text));
      case 'memoAdd': return json_(memoAdd_(p.text));
      case 'memoSet': return json_(memoSet_(p.id, p.on === '1'));
      case 'memoDel': return json_(memoDel_(p.id));
      case 'photoDelete': return json_(photoDelete_(p.id));
      case 'edit': return json_(editItem_(p));
      case 'delete': return json_(deleteItem_(p));
      case 'event': return json_(event_(p.title, p.start, p.allday === '1', p.date));
      case 'photo': return json_(photo_(p.id));
      case 'ping': return json_({ ok: true });
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** 大きなデータ（写真・ルーティンの一覧）は POST で受け取る */
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || p.key !== key) return json_({ ok: false, error: 'bad_key' });
  try {
    switch (p.action) {
      case 'upload': return json_(upload_(p.name, p.data));
      case 'routines': return json_(saveRoutines_(p.list));
      case 'photoOrder': return json_(photoOrder_(p.ids));
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
    memos: safe_(getMemos_) || [],
    ai: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
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
        id: ev.getId(),
        cal: cal.getId(),
        recurring: ev.isRecurringEvent(),
        editable: cal.isOwnedByMe(),
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
    '&timezone=Asia%2FTokyo&forecast_days=7';
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
  const days = (d.daily && d.daily.time || []).map((t, i) => day(i));
  const w = { today: day(0), tomorrow: day(1), days: days, hours: hours.slice(0, 72), fetchedAt: new Date().toISOString() };
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
  // ボードで決めた並び順に並べる。順番が決まっていない写真（新しく入れたもの）は後ろへ
  let order = [];
  try { order = JSON.parse(PropertiesService.getScriptProperties().getProperty('PHOTO_ORDER') || '[]'); } catch (e) { order = []; }
  const rank = (id) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const sorted = ids.map((id, i) => [id, rank(id), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  cache.put('photos', JSON.stringify(sorted), 10 * 60);
  return sorted;
}

/** 写真1枚を、画面に合う大きさ（長辺1600px）の画像データで返す */
function photo_(id) {
  if (getPhotoIds_().indexOf(id) < 0) throw new Error('写真が見つかりません');
  const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  let blob = null;
  const file = DriveApp.getFileById(id);
  if (file.getSize() <= 1.5 * 1024 * 1024 && /image\/(jpeg|png)/.test(file.getMimeType())) blob = file.getBlob();
  if (!blob) try {
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

/** きょうの0時から120日先までのリマインダー。チェックを付けたものは、時刻を過ぎたら返さない */
function getReminders_(date) {
  const cal = getReminderCal_(false);
  if (!cal) return [];
  const day0 = new Date(date + 'T00:00:00+09:00');
  const now = new Date();
  return cal.getEvents(day0, new Date(day0.getTime() + 120 * 86400000)).map((ev) => ({
    id: ev.getId(),
    title: ev.getTitle(),
    start: ev.getStartTime().toISOString(),
    done: ev.getTag('done') === '1',
  })).filter((r) => new Date(r.start) >= day0 && !(r.done && new Date(r.start) <= now));
}

/** リマインダーにチェックの印を付ける・外す（予定そのものは消さない） */
function remindMark_(id, on) {
  const cal = getReminderCal_(false);
  const ev = cal && id ? cal.getEventById(id) : null;
  if (!ev) throw new Error('リマインダーが見つかりません');
  if (on) ev.setTag('done', '1'); else ev.deleteTag('done');
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

/* ---------- ボードからの写真の追加 ---------- */

function upload_(name, base64) {
  if (!base64 || base64.length > 8 * 1024 * 1024) throw new Error('写真が大きすぎます');
  const safe = String(name || 'photo.jpg').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const file = getPhotoFolder_(true).createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', safe));
  CacheService.getScriptCache().remove('photos');
  return { ok: true, id: file.getId() };
}

/* ---------- ボードからのルーティンの編集 ---------- */

function saveRoutines_(list) {
  if (!Array.isArray(list) || list.length > 50) throw new Error('一覧が正しくありません');
  const rows = list.map((r, i) => {
    const title = String(r.title || '').trim().slice(0, 40);
    if (!title) throw new Error('名前が空のルーティンがあります');
    const days = (Array.isArray(r.days) ? r.days : []).filter((d) => d >= 0 && d <= 6);
    const text = days.length === 0 || days.length === 7 ? '毎日' : days.map((d) => DOW.charAt(d)).join('');
    return [String(r.id || 'r' + Date.now() + i), title, text, i + 1, true];
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_().getSheetByName('routines');
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, 5).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, routines: getRoutines_() };
}

/* ---------- 世界の絶景（Bing の日替わり写真。個人利用） ---------- */

function scenic_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('scenic');
  if (hit) return JSON.parse(hit);
  const images = [];
  [0, 8].forEach((idx) => {
    const d = JSON.parse(UrlFetchApp.fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=' + idx + '&n=8&mkt=ja-JP').getContentText());
    (d.images || []).forEach((im) => {
      const url = 'https://www.bing.com' + im.url;
      if (!images.some((x) => x.url === url)) images.push({ url: url, caption: im.copyright || im.title || '' });
    });
  });
  const out = { ok: true, images: images };
  cache.put('scenic', JSON.stringify(out), 6 * 60 * 60);
  return out;
}

/* ---------- 予定・リマインダーの編集と削除（ボードの長押しから） ---------- */

/** 対象の予定を探す。くり返しの予定と、自分のものでないカレンダーは触らない */
function findItem_(p) {
  let cal;
  if (p.kind === 'rm') cal = getReminderCal_(false);
  else {
    cal = p.cal ? CalendarApp.getCalendarById(p.cal) : null;
    if (cal && !cal.isOwnedByMe()) throw new Error('このカレンダーの予定は変更できません');
  }
  const ev = cal && p.id ? cal.getEventById(p.id) : null;
  if (!ev) throw new Error('予定が見つかりません');
  if (ev.isRecurringEvent()) throw new Error('くり返しの予定は Google カレンダーで変更してください');
  return ev;
}

function editItem_(p) {
  const ev = findItem_(p);
  const title = String(p.title || '').trim();
  if (!title) throw new Error('内容が空です');
  if (p.allday === '1' && p.kind !== 'rm') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('日付が読めません');
    ev.setAllDayDate(new Date(p.date + 'T12:00:00+09:00'));
  } else {
    const start = new Date(p.start);
    if (isNaN(start)) throw new Error('日時が読めません');
    // 長さはそのまま保つ（終日だった予定は1時間にする）
    const len = ev.isAllDayEvent() ? 60 * 60000 : ev.getEndTime().getTime() - ev.getStartTime().getTime();
    ev.setTime(start, new Date(start.getTime() + len));
  }
  ev.setTitle(title);
  return { ok: true };
}

function deleteItem_(p) {
  findItem_(p).deleteEvent();
  return { ok: true };
}

/* ---------- 写真の並びかえと削除（ボードの設定の画面から） ---------- */

function photoOrder_(ids) {
  if (!Array.isArray(ids)) throw new Error('一覧が正しくありません');
  PropertiesService.getScriptProperties().setProperty('PHOTO_ORDER', JSON.stringify(ids.slice(0, 300).map(String)));
  CacheService.getScriptCache().remove('photos');
  return { ok: true, photos: getPhotoIds_() };
}

/** 写真フォルダの中の写真だけ、ドライブのゴミ箱に入れる（30日間は元に戻せる） */
function photoDelete_(id) {
  if (getPhotoIds_().indexOf(id) < 0) throw new Error('写真が見つかりません');
  DriveApp.getFileById(id).setTrashed(true);
  CacheService.getScriptCache().remove('photos');
  return { ok: true };
}

/* ---------- メモ・買い物リスト ---------- */

function memoSheet_() {
  const ss = getSheet_();
  let sh = ss.getSheetByName('memos');
  if (!sh) {
    sh = ss.insertSheet('memos');
    sh.getRange(1, 1, 1, 4).setValues([['id', '内容', '済み', '更新']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getMemos_() {
  return memoSheet_().getDataRange().getValues().slice(1).filter((r) => r[0] && r[1])
    .map((r) => ({ id: String(r[0]), text: String(r[1]), done: r[2] === true || String(r[2]).toUpperCase() === 'TRUE' }));
}

function memoAdd_(text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) throw new Error('内容が空です');
  const id = 'm' + Date.now().toString(36);
  memoSheet_().appendRow([id, text, false, new Date()]);
  return { ok: true, id: id, memos: getMemos_() };
}

function memoRow_(sh, id) {
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return i + 1;
  throw new Error('メモが見つかりません');
}

function memoSet_(id, on) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const sh = memoSheet_(); sh.getRange(memoRow_(sh, id), 3, 1, 2).setValues([[on, new Date()]]); } finally { lock.releaseLock(); }
  return { ok: true };
}

function memoDel_(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const sh = memoSheet_(); sh.deleteRow(memoRow_(sh, id)); } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---------- アシスタント（ボードの入力欄と、Siri のショートカットから呼ぶ） ---------- */

const WX_TEXT = { 0: '快晴', 1: '晴れ', 2: '晴れ時々くもり', 3: 'くもり', 45: '霧', 48: '霧', 51: '霧雨', 53: '霧雨', 55: '霧雨', 61: '雨', 63: '雨', 65: '強い雨', 71: '雪', 73: '雪', 75: '雪', 80: 'にわか雨', 81: 'にわか雨', 82: 'にわか雨', 85: 'にわか雪', 86: 'にわか雪', 95: '雷雨', 96: '雷雨', 99: '雷雨' };

/** スクリプトの時計と日本時間のずれ（ミリ秒）。日付の読み取りを日本時間で行うために使う */
function jstShift_() {
  const now = new Date();
  const fake = new Date(Utilities.formatDate(now, TZ, "yyyy-MM-dd'T'HH:mm:ss"));
  return Math.round((fake.getTime() - now.getTime()) / 60000) * 60000;
}

/** 「明日の朝7時に…」を日本時間で読み取る。start は本当の時刻、local は日本時間の年月日 */
function parseJst_(text) {
  const shift = jstShift_();
  const r = globalThis.parseRemind(text, new Date(Date.now() + shift));
  if (!r || !r.found) return r;
  const s = r.start;
  const pad = (n) => ('0' + n).slice(-2);
  r.date = s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate());
  r.label = (s.getMonth() + 1) + '月' + s.getDate() + '日' + (r.timeGiven ? ' ' + s.getHours() + '時' + (s.getMinutes() ? s.getMinutes() + '分' : '') : '');
  r.start = new Date(s.getTime() - shift);
  return r;
}

function say_(text) {
  text = String(text || '').trim().slice(0, 500);
  if (!text) throw new Error('内容が空です');
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  let out = null;
  if (key) { try { out = sayClaude_(text, key); } catch (e) { console.error(e); } }
  if (!out) out = sayRules_(text);
  out.ok = true;
  return out;
}

function dayEventsText_(offset) {
  const now = new Date(Date.now() + offset * 86400000);
  const date = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const name = offset === 0 ? '今日' : offset === 1 ? '明日' : 'あさって';
  const evs = getEvents_(date).filter((e) => (e.allDay ? e.start <= date && date < e.end : Utilities.formatDate(new Date(e.start), TZ, 'yyyy-MM-dd') === date))
    .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1));
  const rems = getReminders_(date).filter((r) => Utilities.formatDate(new Date(r.start), TZ, 'yyyy-MM-dd') === date);
  if (!evs.length && !rems.length) return name + 'の予定はありません。';
  const parts = evs.map((e) => (e.allDay ? '終日 ' : Utilities.formatDate(new Date(e.start), TZ, 'H時mm分').replace('00分', '') + ' ') + e.title)
    .concat(rems.map((r) => 'リマインダー ' + Utilities.formatDate(new Date(r.start), TZ, 'H時mm分').replace('00分', '') + ' ' + r.title));
  return name + 'の予定は' + parts.length + '件です。' + parts.join('、') + '。';
}

function weatherText_(offset) {
  const w = getWeather_();
  const d = (w.days || [w.today, w.tomorrow])[offset];
  if (!d) return '天気を取得できませんでした。';
  const name = offset === 0 ? '今日' : offset === 1 ? '明日' : 'あさって';
  return name + 'は' + (WX_TEXT[d.code] || '—') + '、最高' + Math.round(d.max) + '度、最低' + Math.round(d.min) + '度、降水確率' + d.pop + '%です。' + (offset === 0 ? comment_(w) : '');
}

/** Claude を使わないときの振り分け（決まった言い回しで判断する） */
function sayRules_(text) {
  const t = globalThis.normalizeJa(text);
  const off = /あさって|明後日/.test(t) ? 2 : /明日|あした|あす/.test(t) ? 1 : 0;
  // タイマー
  if (/タイマー/.test(t)) {
    const h = t.match(/(\d+)\s*時間/), m = t.match(/(\d+)\s*分/), s = t.match(/(\d+)\s*秒/);
    const sec = (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
    if (sec > 0) {
      const label = t.replace(/(\d+)\s*(時間|分|秒)(間|後)?/g, '').replace(/タイマー|セット|かけて|して|お願い|を|の|で|に/g, '').trim();
      return { reply: (label ? label + 'の' : '') + 'タイマーをセットしました。', timer: { seconds: sec, label: label } };
    }
  }
  // 聞かれたことに答える
  if (/予定|スケジュール/.test(t) && /(は[?？]?$|教えて|ある[?？]?$|何|なに|[?？]$)/.test(t)) return { reply: dayEventsText_(off) };
  if (/天気|傘|気温/.test(t) && !/リマインド|メモ/.test(t)) return { reply: weatherText_(off) };
  // メモ
  const memoRe = /(を|って|と)?\s*(メモ(して|しといて|しておいて|に追加(して)?|に書いて)?|買い物リストに(追加(して)?|入れて))(ください|ね)?[。]?$/;
  if (memoRe.test(t) || /^メモ[\s:：]/.test(t)) {
    const body = t.replace(memoRe, '').replace(/^メモ[\s:：]+/, '').trim();
    if (body) { memoAdd_(body); return { reply: 'メモしました：' + body, changed: true }; }
  }
  // 日時があれば、予定かリマインダー
  const p = parseJst_(t);
  if (p && p.found && p.title) {
    if (/予定/.test(t) && !/リマインド|リマインダー|教えて|知らせて|通知/.test(t)) {
      const title = p.title.replace(/の?予定(を|に)?(入れて|追加(して)?|登録(して)?)?(ください)?$/, '').trim() || p.title;
      event_(title, p.start.toISOString(), !p.timeGiven, p.date);
      return { reply: p.label + 'に予定「' + title + '」を入れました。', changed: true };
    }
    remind_(p.title, p.start.toISOString(), 30);
    return { reply: p.label + 'にリマインダー「' + p.title + '」を登録しました。', changed: true };
  }
  // どれでもなければメモ
  memoAdd_(t);
  return { reply: 'メモしました：' + t, changed: true };
}

/** Claude に内容を読み取ってもらい、決まった形（JSON）で受け取って実行する */
function sayClaude_(text, key) {
  const now = new Date();
  const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const context = [
    'いまの日時（日本時間）: ' + Utilities.formatDate(now, TZ, "yyyy-MM-dd HH:mm") + '（' + DOW.charAt(Number(Utilities.formatDate(now, TZ, 'u')) % 7) + '曜日）',
    safe_(() => dayEventsText_(0)) || '', safe_(() => dayEventsText_(1)) || '',
    safe_(() => weatherText_(0)) || '', safe_(() => weatherText_(1)) || '',
    'メモ: ' + (safe_(getMemos_) || []).filter((m) => !m.done).map((m) => m.text).join('、'),
  ].join('\n');
  const schema = {
    type: 'object', additionalProperties: false, required: ['reply', 'actions'],
    properties: {
      reply: { type: 'string', description: '利用者への短い返事（日本語、1〜2文。声で読み上げる）' },
      actions: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['type', 'title', 'start', 'all_day', 'seconds'],
          properties: {
            type: { type: 'string', enum: ['reminder', 'event', 'memo', 'timer'] },
            title: { type: 'string' },
            start: { type: 'string', description: '日本時間の日時 YYYY-MM-DDTHH:mm。reminder と event で使う。ほかは空文字' },
            all_day: { type: 'boolean', description: 'event が終日のとき true' },
            seconds: { type: 'integer', description: 'timer の長さ（秒）。ほかは 0' },
          },
        },
      },
    },
  };
  const system = 'あなたは家の壁に置かれた「おうちボード」のアシスタントです。利用者のことばを読み取り、必要なら actions に操作を入れ、reply に短い返事を書きます。\n' +
    '- reminder: その時刻に通知してほしいこと。時刻の指定がなければ朝9時。\n- event: カレンダーの予定。\n- memo: 覚え書きや買い物。\n- timer: 「10分はかって」など。\n' +
    '質問（予定・天気など）には、下の情報だけを使って reply で答え、actions は空にします。情報にないことは「わかりません」と答えます。\n\n' + context;
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 4000, fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
      system: system, messages: [{ role: 'user', content: text }],
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Claude API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  const body = JSON.parse(res.getContentText());
  if (body.stop_reason !== 'end_turn') throw new Error('Claude が途中で止まりました: ' + body.stop_reason);
  const block = (body.content || []).filter((b) => b.type === 'text')[0];
  const out = JSON.parse(block.text);
  const result = { reply: String(out.reply || ''), ai: true };
  (out.actions || []).forEach((a) => {
    const title = String(a.title || '').trim();
    if (a.type === 'timer' && a.seconds > 0) result.timer = { seconds: a.seconds, label: title };
    else if (a.type === 'memo' && title) { memoAdd_(title); result.changed = true; }
    else if ((a.type === 'reminder' || a.type === 'event') && title && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.start || '')) {
      const iso = a.start.slice(0, 16) + ':00+09:00';
      if (a.type === 'reminder') remind_(title, iso, 30); else event_(title, iso, !!a.all_day, a.start.slice(0, 10));
      result.changed = true;
    }
  });
  return result;
}

/* ========== 日付の読み取り（remind-parse.js と同じもの。直すときは remind-parse.js を直して _patch で入れ直す） ========== */
/* 「1週間後にパンチェッタのラップを外す」のような文から、日時と内容を取り出す。
   ブラウザでは window.parseRemind、Node では module.exports で使う。 */
(function (root) {
  const KANJI = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  const DOW = "日月火水木金土";

  // 全角数字・漢数字（〜九十九）を半角に
  function normalize(s) {
    s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
         .replace(/[：]/g, ":").replace(/[／]/g, "/").replace(/　/g, " ");
    return s.replace(/[〇零一二三四五六七八九十]+/g, (m) => {
      if (!/^[〇零一二三四五六七八九]?十?[〇零一二三四五六七八九]?$/.test(m)) return m;
      if (m.indexOf("十") < 0) return m.length === 1 ? String(KANJI[m]) : m;
      const [a, b] = m.split("十");
      return String((a ? KANJI[a] : 1) * 10 + (b ? KANJI[b] : 0));
    });
  }

  function parseRemind(text, now) {
    now = now ? new Date(now) : new Date();
    const src = normalize(String(text || "")).trim();
    if (!src) return null;
    let rest = src;
    // 取り出した部分は目印 \u0001 に置きかえ、あとで直後の「に」「の」ごと消す
    const cut = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], "\u0001"); return m; };

    let date = null;      // 日付（0時）
    let exact = null;     // 「3時間後」などの正確な時刻
    let m;
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    if ((m = cut(/(\d+)\s*時間\s*後/))) exact = new Date(now.getTime() + Number(m[1]) * 3600000);
    else if ((m = cut(/(\d+)\s*分\s*後/))) exact = new Date(now.getTime() + Number(m[1]) * 60000);
    else if ((m = cut(/(\d+)\s*日\s*後/))) date = addDays(today0, Number(m[1]));
    else if ((m = cut(/(\d+)\s*週間?\s*後/))) date = addDays(today0, Number(m[1]) * 7);
    else if ((m = cut(/(\d+)\s*[かカヶケ箇]?\s*月\s*後/))) date = new Date(today0.getFullYear(), today0.getMonth() + Number(m[1]), today0.getDate());
    else if ((m = cut(/(?:(\d{4})\s*[年\/-]\s*)?(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/))) {
      const y = m[1] ? Number(m[1]) : now.getFullYear();
      date = new Date(y, Number(m[2]) - 1, Number(m[3]));
      if (!m[1] && date < today0) date = new Date(y + 1, Number(m[2]) - 1, Number(m[3]));
    } else if ((m = cut(/(\d{1,2})\s*日\s*(?=[にのは、\s]|$)/))) {
      date = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
      if (date < today0) date = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
    } else if ((m = cut(/(再来週|来週|今週)?\s*の?\s*([日月火水木金土])\s*曜日?/))) {
      const target = DOW.indexOf(m[2]);
      if (m[1]) {
        const weeks = m[1] === "再来週" ? 2 : m[1] === "来週" ? 1 : 0;
        const monday = addDays(today0, -((today0.getDay() + 6) % 7)); // 週は月曜はじまり
        date = addDays(monday, weeks * 7 + ((target + 6) % 7));
      } else {
        let diff = (target - today0.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        date = addDays(today0, diff);
      }
    } else if ((m = cut(/明々後日|しあさって/))) date = addDays(today0, 3);
    else if ((m = cut(/明後日|あさって/))) date = addDays(today0, 2);
    else if ((m = cut(/明日|あした|あす/))) date = addDays(today0, 1);
    else if ((m = cut(/再来週/))) date = addDays(today0, 14);
    else if ((m = cut(/来週/))) date = addDays(today0, 7);
    else if ((m = cut(/来月/))) date = new Date(today0.getFullYear(), today0.getMonth() + 1, today0.getDate());
    else if ((m = cut(/今日|きょう/))) date = today0;

    // 時刻
    let hour = null, minute = 0, timeGiven = false;
    if (!exact) {
      if ((m = cut(/(午前|午後|朝|昼|夕方|夜|晩)?\s*(\d{1,2})\s*時\s*(半|(\d{1,2})\s*分)?/))) {
        hour = Number(m[2]); minute = m[3] === "半" ? 30 : m[4] ? Number(m[4]) : 0;
        if (/午後|夕方|夜|晩/.test(m[1] || "") && hour < 12) hour += 12;
        if (m[1] === "昼" && hour < 6) hour += 12;
        timeGiven = true;
      } else if ((m = cut(/(\d{1,2}):(\d{2})/))) {
        hour = Number(m[1]); minute = Number(m[2]); timeGiven = true;
      } else if ((m = cut(/朝/))) { hour = 8; timeGiven = true; }
      else if ((m = cut(/昼/))) { hour = 12; timeGiven = true; }
      else if ((m = cut(/夕方/))) { hour = 17; timeGiven = true; }
      else if ((m = cut(/夜|晩/))) { hour = 20; timeGiven = true; }
    }

    let start;
    if (exact) start = exact;
    else if (date) start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour == null ? 9 : hour, minute);
    else if (timeGiven) {
      start = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate(), hour, minute);
      if (start <= now) start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, hour, minute);
    } else return { title: cleanTitle(rest), start: null, found: false };

    return { title: cleanTitle(rest), start: start, found: true, timeGiven: !!(exact || timeGiven) };
  }

  function cleanTitle(s) {
    return s
      .replace(/\u0001[\s、,]*[にのはで]?(?=\u0001)/g, "")
      .replace(/\u0001[\s、,]*[にのはで]?/g, " ")
      .replace(/(って|と|を|に)?\s*(教えて|知らせて|リマインドして|覚えて(おいて|て)?|通知して|お願い)(ください|ね|ほしい)?[。！!]*\s*$/, "")
      .replace(/[\s、,]+/g, " ")
      .replace(/([^\x00-\x7f]) (?=[^\x00-\x7f])/g, "$1")
      .replace(/[\s、,]+$/, "")
      .trim();
  }

  root.parseRemind = parseRemind;
  root.normalizeJa = normalize;
  if (typeof module !== "undefined") module.exports = { parseRemind, normalize };
})(typeof window !== "undefined" ? window : globalThis);
