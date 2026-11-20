/**
 * おうちボード 裏方（Google Apps Script ウェブアプリ）
 *
 * 使い方は docs/設定手順.md を参照。
 * 1. このファイルを Apps Script に貼り付ける
 * 2. 関数 setup を一度実行（権限を許可）→ ログに合言葉が出る
 * 3. デプロイ → ウェブアプリ（実行：自分／アクセス：全員）
 */

// 地点。引っ越したら、Apps Script の「プロジェクトの設定 → スクリプト プロパティ」に
// PLACE（例：東京都日野市）・LAT・LON を入れれば、コードを直さずに切り替わる（ボードの天気・警報・日の出も追従する）
const PROPS_ = PropertiesService.getScriptProperties();
const PLACE = PROPS_.getProperty('PLACE') || '東京都日野市';
const LAT = Number(PROPS_.getProperty('LAT')) || 35.6713;
const LON = Number(PROPS_.getProperty('LON')) || 139.3951;
const TZ = 'Asia/Tokyo';
const NEWS_RSS = 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja';
// アシスタントやドライブ画像読み取りに使う AI（スクリプトプロパティ GEMINI_API_KEY または ANTHROPIC_API_KEY を入れたときだけ使う）
const GEMINI_MODEL = PROPS_.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
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
  GmailApp.getInboxUnreadCount();   // Gmail を読む許可（未読の件数を出すため）
  if (typeof Tasks !== 'undefined') Logger.log('メモ・買い物の保存先: Google ToDo リスト「' + TASKLIST_NAME + '」（id ' + taskListId_() + '）');
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

function flag_(v) { return v === true || v === '1' || v === 1; }

function dispatchAction_(p, isPost) {
  if (/^(check|remind|mark|edit|delete|event|say|routines|pomoLog|expenseAdd|budgetSet|taskAdd|taskSet|taskDel|taskDue|taskListAdd)$/.test(p.action)) bust_();
  switch (p.action) {
    case 'board': return board_(p.date);
    case 'check': return check_(p.date, p.id, flag_(p.on));
    case 'remind': return remind_(p.title, p.start, Number(p.minutes || 30));
    case 'mark': return remindMark_(p.id, flag_(p.on));
    case 'scenic': return scenic_();
    case 'say': return say_(p.text);
    case 'memoAdd': return memoAdd_(p.text);
    case 'memoSet': return memoSet_(p.id, flag_(p.on));
    case 'memoDel': return memoDel_(p.id);
    case 'taskAdd': return taskAdd_(p.listId, p.text, p.due);
    case 'taskSet': return taskSet_(p.listId, p.id, flag_(p.on));
    case 'taskDel': return taskDel_(p.listId, p.id);
    case 'taskDue': return taskDue_(p.listId, p.id, p.due);
    case 'taskListAdd': return taskListAdd_(p.title);
    case 'pomoLog': return pomoLog_(p.date, p.task, Number(p.minutes || 25));
    case 'expenseAdd': return expenseAdd_(Number(p.amount), p.category, p.memo);
    case 'budgetSet': return budgetSet_(Number(p.budget));
    case 'weeklyDoc': return createWeeklyDoc();
    case 'processInbox': return processInboxFolder();
    case 'mailRead': return mailRead_(p.id, flag_(p.all));
    case 'mailPrefs': return mailPrefsSet_(flag_(p.important), p.from, p.days);
    case 'photoDelete': return photoDelete_(p.id);
    case 'edit': return editItem_(p);
    case 'delete': return deleteItem_(p);
    case 'event': return event_(p.title, p.start, flag_(p.allday), p.date);
    case 'photo': return photo_(p.id);
    case 'month': return month_(p.ym);
    case 'taskMonth': return taskMonth_(p.ym);
    case 'ping': return { ok: true };
    case 'upload': if (isPost) return upload_(p.name, p.data); break;
    case 'routines': if (isPost) return saveRoutines_(p.list); break;
    case 'photoOrder': if (isPost) return photoOrder_(p.ids); break;
  }
  return { ok: false, error: 'unknown_action' };
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || p.key !== key) return json_({ ok: false, error: 'bad_key' });
  try {
    return json_(dispatchAction_(p, false));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** 大きなデータ（写真・ルーティンの一覧）や書き込み系操作は POST で受け取る */
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || p.key !== key) return json_({ ok: false, error: 'bad_key' });
  try {
    return json_(dispatchAction_(p, true));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- まとめて返す ---------- */

/* 予定・リマインダーは90秒だけ覚える（5分ごとの更新や Siri からの呼び出しを軽くする）。
   ボードから書き換えたときは bust_() で世代を進め、すぐ新しい内容を返す。 */
function gen_() { return CacheService.getScriptCache().get('gen') || '0'; }
function bust_() { CacheService.getScriptCache().put('gen', String(Date.now()), 21600); }
function cached_(key, sec, fn) {
  const cache = CacheService.getScriptCache(), k = key + ':' + gen_();
  const hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  const v = fn();
  try { const js = JSON.stringify(v); if (js.length < 90000) cache.put(k, js, sec); } catch (e) {}
  return v;
}

function board_(dateStr) {
  const date = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const weather = safe_(getWeather_);
  const routines = getRoutines_();
  const cs = safe_(() => cached_('chk:' + date, 90, () => getChecksAndStreaks_(date, routines))) || { checks: {}, streaks: {} };
  const events = safe_(() => cached_('ev:' + date, 90, () => getEvents_(date)));
  const taskLists = safe_(getTasksAll_) || [];
  const memos = taskLists.length ? taskLists[0].items : (safe_(getMemos_) || []);
  return {
    ok: true,
    date: date,
    place: PLACE,
    lat: LAT,
    lon: LON,
    events: events,
    travel: safe_(() => getTravelForEvents_(events, date)) || {},
    reminders: safe_(() => cached_('rm:' + date, 90, () => getReminders_(date))) || [],
    weather: weather,
    comment: weather ? comment_(weather) : '',
    news: safe_(getNews_),
    routines: routines,
    checks: cs.checks || {},
    streaks: cs.streaks || {},
    photos: safe_(getPhotoIds_) || [],
    memos: memos,
    taskLists: taskLists,
    mail: safe_(getMail_),
    mailBrief: safe_(getMailBrief_),
    life: safe_(getLifeMail_) || { deliveries: [], bills: [] },
    weekly: safe_(() => cached_('wk:' + date, 90, () => getWeeklyReview_(date, routines))) || null,
    expenses: safe_(() => cached_('exp:' + date.slice(0, 7), 90, () => getExpenses_(date))) || null,
    inbox: safe_(getInboxState_) || null,
    weeklyDoc: safe_(getLatestWeeklyDoc_) || null,
    google: {
      tasks: useTasks_(),
      formUrl: PROPS_.getProperty('EXPENSE_FORM_URL') || '',
      gemini: !!PROPS_.getProperty('GEMINI_API_KEY'),
      inboxFolderUrl: PROPS_.getProperty('INBOX_FOLDER_URL') || '',
    },
    ai: !!(PROPS_.getProperty('GEMINI_API_KEY') || PROPS_.getProperty('ANTHROPIC_API_KEY')),
    at: new Date().toISOString(),
  };
}

function safe_(fn) {
  try { return fn(); } catch (e) { console.error(e); return null; }
}

/* ---------- カレンダー ---------- */

/** 月のカレンダー用：ym（2026-11）の月の予定。前後の週の分も少し入れる */
function month_(ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return { ok: false, error: 'bad_month' };
  const first = new Date(ym + '-01T00:00:00+09:00');
  const from = new Date(first.getTime() - 7 * 86400000);
  return { ok: true, ym: ym, events: getEvents_(Utilities.formatDate(from, TZ, 'yyyy-MM-dd'), 7 + 31 + 14) };
}

function getEvents_(date, days) {
  const start = new Date(date + 'T00:00:00+09:00');
  const end = new Date(start.getTime() + (days || 8) * 86400000);
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
  const ck = 'weather:' + LAT + ',' + LON;   // 地点を変えたらすぐ切り替わるように
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&timezone=Asia%2FTokyo&forecast_days=7';
  let d;
  try {
    d = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  } catch (e) {
    // Open-Meteo につながらないときは、6時間以内に取った前回の天気を、きょうの日付に合わせて返す
    const old = cache.get(ck + ':stale');
    if (!old) throw e;
    const w0 = JSON.parse(old), today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    const i = (w0.days || []).findIndex((x) => x && x.date === today);
    if (i < 0) throw e;
    return Object.assign(w0, { today: w0.days[i], tomorrow: w0.days[i + 1] || null, stale: true });
  }
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
  const js = JSON.stringify(w);
  cache.put(ck, js, 30 * 60);
  cache.put(ck + ':stale', js, 6 * 60 * 60);   // つながらないとき用（キャッシュの上限は6時間）
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

function normCheckDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').replace(/^'/, '');
}

/** checks シートを1回だけ読み、当日のチェック状態と前日までの連続記録を同時に計算する */
function getChecksAndStreaks_(date, routines) {
  const rows = getSheet_().getSheetByName('checks').getDataRange().getValues().slice(1);
  const checks = {};
  const done = {};
  rows.forEach((r) => {
    const d = normCheckDate_(r[0]);
    const id = String(r[1] || '');
    if (!d || !id) return;
    const on = r[2] === true || String(r[2]).toUpperCase() === 'TRUE';
    if (d === date) checks[id] = on;
    if (on) (done[id] = done[id] || {})[d] = true;
  });
  const streaks = {};
  const base = new Date(date + 'T12:00:00+09:00');
  // きのうから180日前までの日付と曜日を先に1回だけ作る
  const back = [];
  for (let i = 1; i <= 180; i++) {
    const t = new Date(base.getTime() - i * 86400000);
    back.push({ key: Utilities.formatDate(t, TZ, 'yyyy-MM-dd'), dow: Number(Utilities.formatDate(t, TZ, 'u')) % 7 });   // u は 1=月〜7=日
  }
  (routines || getRoutines_()).forEach((rt) => {
    const has = done[rt.id] || {};
    let n = 0;
    for (const b of back) {
      if (rt.days.length && rt.days.indexOf(b.dow) < 0) continue;
      if (!has[b.key]) break;
      n++;
    }
    if (n >= 1) streaks[rt.id] = n;
  });
  return { checks: checks, streaks: streaks };
}

/** タスクの月カレンダー用：指定月（前後1週間含む）のチェック済みルーティン履歴を日付マップで返す */
function taskMonth_(ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return { ok: false, error: 'bad_month' };
  const days = cached_('tm:' + ym, 90, () => {
    const first = new Date(ym + '-01T12:00:00+09:00');
    const from = Utilities.formatDate(new Date(first.getTime() - 7 * 86400000), TZ, 'yyyy-MM-dd');
    const to = Utilities.formatDate(new Date(first.getTime() + 40 * 86400000), TZ, 'yyyy-MM-dd');
    const rows = getSheet_().getSheetByName('checks').getDataRange().getValues().slice(1);
    const out = {};
    rows.forEach((r) => {
      if (!(r[2] === true || String(r[2]).toUpperCase() === 'TRUE')) return;
      const d = normCheckDate_(r[0]), id = String(r[1] || '');
      if (!d || !id || d < from || d > to) return;
      (out[d] = out[d] || []).push(id);
    });
    return out;
  });
  return { ok: true, ym: ym, days: days };
}

function getChecks_(date) {
  const rows = getSheet_().getSheetByName('checks').getDataRange().getValues().slice(1);
  const out = {};
  rows.forEach((r) => {
    if (normCheckDate_(r[0]) === date) out[String(r[1])] = r[2] === true || String(r[2]).toUpperCase() === 'TRUE';
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
      if (normCheckDate_(values[i][0]) === date && String(values[i][1]) === id) { row = i + 1; break; }
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
  if (flag_(p.allday) && p.kind !== 'rm') {
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

/* メモ・買い物の保存先。Apps Script の「サービス」に Tasks API を足すと、Google ToDo リストの「おうちボード」に切り替わる
   （iPhone の Google ToDo アプリでも見られる）。足していなければ、これまでどおりスプレッドシートの memos シート。 */
const TASKLIST_NAME = 'おうちボード';
function useTasks_() {
  return typeof Tasks !== 'undefined' && PROPS_.getProperty('MEMO_TASKS') !== 'off';
}
function taskListId_() {
  let id = PROPS_.getProperty('TASKLIST_ID');
  if (id) { try { Tasks.Tasklists.get(id); return id; } catch (e) { id = null; } }
  const lists = (Tasks.Tasklists.list({ maxResults: 100 }).items || []);
  const hit = lists.find((l) => l.title === TASKLIST_NAME);
  id = hit ? hit.id : Tasks.Tasklists.insert({ title: TASKLIST_NAME }).id;
  PROPS_.setProperty('TASKLIST_ID', id);
  // はじめて切り替えたときだけ、スプレッドシートの済んでいないメモを移す
  if (!PROPS_.getProperty('MEMO_MIGRATED')) {
    memoSheet_().getDataRange().getValues().slice(1).filter((r) => r[0] && r[1] && !(r[2] === true || String(r[2]).toUpperCase() === 'TRUE'))
      .forEach((r) => Tasks.Tasks.insert({ title: String(r[1]) }, id));
    PROPS_.setProperty('MEMO_MIGRATED', '1');
  }
  return id;
}

function getMemos_() {
  if (useTasks_()) {
    const items = Tasks.Tasks.list(taskListId_(), { showCompleted: true, showHidden: false, maxResults: 100 }).items || [];
    return items.filter((t) => t.title && !t.deleted).sort((a, b) => String(a.position).localeCompare(String(b.position)))
      .map((t) => ({ id: t.id, text: t.title, done: t.status === 'completed' }));
  }
  return memoSheet_().getDataRange().getValues().slice(1).filter((r) => r[0] && r[1])
    .map((r) => ({ id: String(r[0]), text: String(r[1]), done: r[2] === true || String(r[2]).toUpperCase() === 'TRUE' }));
}

function memoAdd_(text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) throw new Error('内容が空です');
  if (useTasks_()) {
    const t = Tasks.Tasks.insert({ title: text }, taskListId_());
    return { ok: true, id: t.id, memos: getMemos_() };
  }
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
  if (useTasks_()) {
    Tasks.Tasks.patch(on ? { status: 'completed' } : { status: 'needsAction', completed: null }, taskListId_(), id);
    return { ok: true };
  }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const sh = memoSheet_(); sh.getRange(memoRow_(sh, id), 3, 1, 2).setValues([[on, new Date()]]); } finally { lock.releaseLock(); }
  return { ok: true };
}

function memoDel_(id) {
  if (useTasks_()) { Tasks.Tasks.remove(taskListId_(), id); return { ok: true }; }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { const sh = memoSheet_(); sh.deleteRow(memoRow_(sh, id)); } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ---------- Gmail：未読の件数と、大事な未読メール（5分キャッシュ）。
   大事の条件はスクリプトプロパティ MAIL_QUERY で変えられる（例：in:inbox is:unread (is:important OR from:ac.jp)） ---------- */
/* 「大事なメール」の条件。ボードの「表示の設定」から変える（スクリプトプロパティ MAIL_IMPORTANT・MAIL_FROM・MAIL_DAYS）。
   MAIL_QUERY を手で入れてあれば、そちらを優先する。 */
function mailPrefs_() {
  return {
    important: PROPS_.getProperty('MAIL_IMPORTANT') !== '0',
    from: PROPS_.getProperty('MAIL_FROM') || '',
    days: Number(PROPS_.getProperty('MAIL_DAYS')) || 3,
    custom: !!PROPS_.getProperty('MAIL_QUERY'),
  };
}
function mailQuery_() {
  const custom = PROPS_.getProperty('MAIL_QUERY');
  if (custom) return custom;
  const p = mailPrefs_(), ors = [];
  if (p.important) ors.push('is:important');
  p.from.split(/[\s,、，]+/).filter(Boolean).slice(0, 20).forEach((f) => ors.push('from:' + f.replace(/[^\w.@+-]/g, '')));
  if (!ors.length) ors.push('is:important');
  return 'in:inbox is:unread newer_than:' + p.days + 'd (' + ors.join(' OR ') + ')';
}
function mailPrefsSet_(important, from, days) {
  PROPS_.setProperty('MAIL_IMPORTANT', important ? '1' : '0');
  PROPS_.setProperty('MAIL_FROM', String(from || '').slice(0, 400));
  PROPS_.setProperty('MAIL_DAYS', String(Math.min(30, Math.max(1, Number(days) || 3))));
  CacheService.getScriptCache().remove('mail');
  return { ok: true, mail: getMail_() };
}

function getMail_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('mail');
  if (hit) return JSON.parse(hit);
  const q = mailQuery_();
  const pick = (th) => {
    const m = th.getMessages().pop(), from = String(m.getFrom()).replace(/\s*<.*>$/, '').replace(/^"|"$/g, '');
    return { id: th.getId(), from: from.slice(0, 30), subject: String(th.getFirstMessageSubject() || '（件名なし）').slice(0, 60), at: m.getDate().toISOString() };
  };
  const items = GmailApp.search(q, 0, 8).map(pick);
  // 大事なもの以外の、新しい未読（メインのタブだけ）も少し出す
  const ids = {}; items.forEach((x) => { ids[x.id] = 1; });
  const recent = GmailApp.search('in:inbox is:unread category:primary', 0, 8).map(pick).filter((x) => !ids[x.id]).slice(0, 5);
  const out = { unread: GmailApp.getInboxUnreadCount(), important: items, recent: recent, prefs: mailPrefs_() };
  cache.put('mail', JSON.stringify(out), 90);
  return out;
}

/** メールを既読にする。id があればそのスレッド、all=1 なら受信トレイの未読をすべて（100件ずつ） */
/* 毎朝のルーチン（claude.ai の「毎朝のGmail確認」）が、ドライブのフォルダ「おうちボード けさのメール」に
   その日のまとめのテキストファイル（けさのメール YYYY-MM-DD）を作る。いちばん新しいものをボードに出し、7日より古いものはゴミ箱へ。 */
const BRIEF_FOLDER = 'おうちボード けさのメール';
function getMailBrief_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('mailBrief');
  if (hit) return JSON.parse(hit);
  const it = DriveApp.getFoldersByName(BRIEF_FOLDER);
  if (!it.hasNext()) return null;
  const files = [], fi = it.next().getFiles();
  while (fi.hasNext()) {
    const f0 = fi.next(), mt = String(f0.getMimeType() || '');
    if (mt === MimeType.GOOGLE_DOCS || mt.indexOf('text/') === 0) files.push(f0);
  }
  if (!files.length) return null;
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  const old = Date.now() - 7 * 86400000;
  files.slice(1).forEach((f) => { if (f.getDateCreated().getTime() < old) f.setTrashed(true); });
  const f = files[0];
  let text = '';
  if (f.getMimeType() === MimeType.GOOGLE_DOCS) {
    try { text = DocumentApp.openById(f.getId()).getBody().getText(); } catch (e) { text = ''; }
  } else {
    text = f.getBlob().getDataAsString('UTF-8');
  }
  const out = { text: String(text).slice(0, 2000), at: f.getDateCreated().toISOString(), title: f.getName() };
  cache.put('mailBrief', JSON.stringify(out), 10 * 60);
  return out;
}

function mailRead_(id, all) {
  if (all) {
    for (let i = 0; i < 20; i++) {
      const ths = GmailApp.search('in:inbox is:unread', 0, 100);
      if (!ths.length) break;
      GmailApp.markThreadsRead(ths);
    }
  } else if (id) {
    GmailApp.getThreadById(id).markRead();
  }
  CacheService.getScriptCache().remove('mail');
  return { ok: true, mail: getMail_() };
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
  const geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const claudeKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  let out = null;
  if (geminiKey) { try { out = sayGemini_(text, geminiKey); } catch (e) { console.error('sayGemini_:', e); } }
  if (!out && claudeKey) { try { out = sayClaude_(text, claudeKey); } catch (e) { console.error('sayClaude_:', e); } }
  if (!out) out = sayRules_(text);
  out.ok = true;
  return out;
}

function dayEventsText_(offset) {
  const now = new Date(Date.now() + offset * 86400000);
  const date = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const name = offset === 0 ? '今日' : offset === 1 ? '明日' : 'あさって';
  const evs = cached_('ev:' + date, 90, () => getEvents_(date)).filter((e) => (e.allDay ? e.start <= date && date < e.end : Utilities.formatDate(new Date(e.start), TZ, 'yyyy-MM-dd') === date))
    .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1));
  const rems = cached_('rm:' + date, 90, () => getReminders_(date)).filter((r) => Utilities.formatDate(new Date(r.start), TZ, 'yyyy-MM-dd') === date);
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

/* ---------- Google アプリ連携パック（Maps / Tasks複数リスト / Gmail生活 / フォーム家計簿 / ポモドーロ / ドライブ×Gemini / ドキュメント週報） ---------- */

/** Google 連携の追加セットアップ（一度実行すると、3秒家計簿フォーム・AI投入フォルダ・週報フォルダを自動作成する） */
function setupGoogleApps() {
  setup();
  const props = PropertiesService.getScriptProperties();
  const ss = getSheet_();
  expenseSheet_();
  focusSheet_();
  // 1. 3秒家計簿 Google フォーム
  let formUrl = props.getProperty('EXPENSE_FORM_URL');
  if (!formUrl) {
    const form = FormApp.create('おうちボード 3秒家計簿');
    form.setDescription('金額とカテゴリを送ると、おうちボードの今月の支出に自動反映されます。');
    form.addTextItem().setTitle('金額（円）').setRequired(true);
    form.addMultipleChoiceItem().setTitle('カテゴリ').setChoiceValues(['食費', '日用品', '交通費', '研究・書籍', '交際・趣味', 'その他']).setRequired(true);
    form.addTextItem().setTitle('メモ（任意）').setRequired(false);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    formUrl = form.getPublishedUrl();
    props.setProperty('EXPENSE_FORM_URL', formUrl);
    props.setProperty('EXPENSE_FORM_ID', form.getId());
  }
  // 2. ドライブ投入フォルダ（レシート・プリント・ごみ表の画像を入れる用）
  const inbox = getOrCreateFolder_('INBOX_FOLDER_ID', 'おうちボード 投入');
  props.setProperty('INBOX_FOLDER_URL', inbox.getUrl());
  // 3. 週報フォルダ（Google ドキュメント保存用）
  const wkDir = getOrCreateFolder_('WEEKLY_FOLDER_ID', 'おうちボード 週報');
  // 4. Maps 権限チェック
  try { Maps.newDirectionFinder().setOrigin(LAT + ',' + LON).setDestination('東京駅').setMode(Maps.DirectionFinder.Mode.TRANSIT).getDirections(); } catch (e) {}
  Logger.log('3秒家計簿フォーム（iPhone のホーム画面に追加すると便利）: ' + formUrl);
  Logger.log('ドライブ投入フォルダ（画像/PDFを入れる）: ' + inbox.getUrl());
  Logger.log('週報ドキュメントフォルダ: ' + wkDir.getUrl());
  return { ok: true, formUrl: formUrl, inboxFolderUrl: inbox.getUrl(), weeklyFolderUrl: wkDir.getUrl() };
}

function getOrCreateFolder_(propKey, folderName) {
  const id = PROPS_.getProperty(propKey);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const it = DriveApp.getFoldersByName(folderName);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  PROPS_.setProperty(propKey, folder.getId());
  return folder;
}

/* --- Google マップ：予定の場所までの所要時間（1日1,000回無料・6時間キャッシュ） --- */
function getTravel_(dest) {
  dest = String(dest || '').trim();
  if (!dest || dest.length < 2 || /^(オンライン|Zoom|Teams|Meet|自宅|家|なし)$/i.test(dest)) return null;
  const cache = CacheService.getScriptCache();
  const ck = 'trv:' + LAT + ',' + LON + ':' + dest.slice(0, 60);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  let out = null;
  try {
    let res = Maps.newDirectionFinder()
      .setOrigin(LAT + ',' + LON)
      .setDestination(dest)
      .setMode(Maps.DirectionFinder.Mode.TRANSIT)
      .setLanguage('ja')
      .getDirections();
    let mode = 'transit';
    if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) {
      res = Maps.newDirectionFinder()
        .setOrigin(LAT + ',' + LON)
        .setDestination(dest)
        .setMode(Maps.DirectionFinder.Mode.WALKING)
        .setLanguage('ja')
        .getDirections();
      mode = 'walk';
    }
    if (res && res.status === 'OK' && res.routes && res.routes[0] && res.routes[0].legs && res.routes[0].legs[0]) {
      const leg = res.routes[0].legs[0];
      out = { min: Math.max(1, Math.round(leg.duration.value / 60)), text: leg.duration.text, dist: leg.distance ? leg.distance.text : '', mode: mode };
    }
  } catch (e) { console.error('getTravel_:', e); }
  try { cache.put(ck, JSON.stringify(out), 6 * 3600); } catch (e) {}
  return out;
}

function getTravelForEvents_(events, date) {
  if (!Array.isArray(events) || !events.length) return {};
  const now = Date.now(), limit = now + 36 * 3600000;
  const out = {};
  let count = 0;
  for (let i = 0; i < events.length && count < 3; i++) {
    const ev = events[i];
    if (!ev || ev.allDay || !ev.location) continue;
    const t = new Date(ev.start).getTime();
    if (isNaN(t) || t < now - 15 * 60000 || t > limit) continue;
    if (ev.location in out) continue;
    const tr = getTravel_(ev.location);
    if (tr) { out[ev.location] = tr; count++; }
  }
  return out;
}

/* --- Google ToDo（Tasks API）：複数リスト＋締切日（due）対応 --- */
function getTasksAll_() {
  if (!useTasks_()) {
    return [{ id: 'sheet', title: TASKLIST_NAME, items: getMemos_() }];
  }
  const mainId = taskListId_();
  const lists = (Tasks.Tasklists.list({ maxResults: 20 }).items || []).slice(0, 6);
  // メインの「おうちボード」を先頭に並べる
  lists.sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : 0));
  return lists.map((l) => {
    const items = (Tasks.Tasks.list(l.id, { showCompleted: true, showHidden: false, maxResults: 100 }).items || [])
      .filter((t) => t.title && !t.deleted)
      .sort((a, b) => String(a.position).localeCompare(String(b.position)))
      .map((t) => ({
        id: t.id,
        text: t.title,
        done: t.status === 'completed',
        due: t.due ? String(t.due).slice(0, 10) : '',
        notes: t.notes ? String(t.notes).slice(0, 200) : '',
      }));
    return { id: l.id, title: l.title, items: items };
  });
}

function resolveListId_(listId) {
  if (!useTasks_()) return 'sheet';
  return listId && listId !== 'sheet' ? String(listId) : taskListId_();
}

function taskAdd_(listId, text, due) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) throw new Error('内容が空です');
  if (!useTasks_()) {
    const r = memoAdd_(text);
    return { ok: true, id: r.id, taskLists: getTasksAll_(), memos: r.memos };
  }
  const lid = resolveListId_(listId);
  const body = { title: text };
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) body.due = due + 'T00:00:00.000Z';
  const t = Tasks.Tasks.insert(body, lid);
  const all = getTasksAll_();
  return { ok: true, id: t.id, taskLists: all, memos: all.length ? all[0].items : [] };
}

function taskSet_(listId, id, on) {
  if (!useTasks_()) return memoSet_(id, on);
  Tasks.Tasks.patch(on ? { status: 'completed' } : { status: 'needsAction', completed: null }, resolveListId_(listId), id);
  return { ok: true };
}

function taskDel_(listId, id) {
  if (!useTasks_()) return memoDel_(id);
  Tasks.Tasks.remove(resolveListId_(listId), id);
  return { ok: true };
}

function taskDue_(listId, id, due) {
  if (!useTasks_()) return { ok: true };
  const patch = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? { due: due + 'T00:00:00.000Z' } : { due: null };
  Tasks.Tasks.patch(patch, resolveListId_(listId), id);
  return { ok: true, taskLists: getTasksAll_() };
}

function taskListAdd_(title) {
  title = String(title || '').trim().slice(0, 40);
  if (!title) throw new Error('リスト名が空です');
  if (!useTasks_()) throw new Error('複数リストには Tasks API の有効化が必要です');
  const created = Tasks.Tasklists.insert({ title: title });
  return { ok: true, id: created.id, taskLists: getTasksAll_() };
}

/* --- Gmail 生活インボックス（宅配便・カード引き落としを外部送信なしでルール抽出・15分キャッシュ） --- */
function getLifeMail_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('lifeMail');
  if (hit) return JSON.parse(hit);
  const deliveries = [], bills = [], seenDel = {}, seenBill = {};
  const delThs = GmailApp.search('(Amazon OR ヤマト OR 佐川 OR ゆうパック OR お届け予定 OR 配達予定 OR 本日お届け) newer_than:2d', 0, 10);
  delThs.forEach((th) => {
    const m = th.getMessages().pop();
    const subj = String(th.getFirstMessageSubject() || '');
    if (/配達完了|お届け済み/.test(subj)) return;
    const from = String(m.getFrom() || '');
    const snippet = String(m.getPlainBody() || '').slice(0, 600);
    const all = subj + ' ' + from + ' ' + snippet;
    if (!/お届け予定|配達予定|本日お届け|発送のお知らせ|配送状況|荷物のお届け/.test(all)) return;
    const carrier = /ヤマト|クロネコ|kuronekoyamato/i.test(all) ? 'ヤマト運輸'
      : /佐川|sagawa/i.test(all) ? '佐川急便'
      : /日本郵便|ゆうパック|post\.japanpost/i.test(all) ? '日本郵便'
      : /Amazon|アマゾン/i.test(all) ? 'Amazon' : '宅配便';
    const winM = all.match(/(\d{1,2})\s*[:時]\s*(?:00)?\s*[〜~\-ー]\s*(\d{1,2})\s*[:時]|午前中/);
    const win = winM ? (winM[0] === '午前中' ? '午前中' : winM[1] + '-' + winM[2] + '時') : '';
    const key = carrier + '|' + subj.slice(0, 20);
    if (!seenDel[key]) {
      seenDel[key] = 1;
      deliveries.push({ id: th.getId(), carrier: carrier, window: win, subject: subj.slice(0, 48), at: m.getDate().toISOString() });
    }
  });
  const billThs = GmailApp.search('(お支払予定 OR ご請求金額 OR 引き落とし OR 請求額確定) newer_than:25d', 0, 10);
  billThs.forEach((th) => {
    const m = th.getMessages().pop();
    const subj = String(th.getFirstMessageSubject() || '');
    const from = String(m.getFrom() || '');
    const snippet = String(m.getPlainBody() || '').slice(0, 800);
    const all = subj + ' ' + from + ' ' + snippet;
    const amtM = all.match(/([\d,]{3,9})\s*円|[¥￥]\s*([\d,]{3,9})/);
    const dtM = all.match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*日?/);
    const amount = amtM ? Number((amtM[1] || amtM[2]).replace(/,/g, '')) : 0;
    const card = /楽天カード|rakuten/i.test(all) ? '楽天カード'
      : /三井住友|Vpass|smbc/i.test(all) ? '三井住友カード'
      : /JCB/i.test(all) ? 'JCBカード'
      : /エポス|epos/i.test(all) ? 'エポスカード'
      : /PayPayカード/i.test(all) ? 'PayPayカード'
      : from.replace(/\s*<.*>$/, '').replace(/^"|"$/g, '').slice(0, 18) || '請求';
    const payDate = dtM ? Number(dtM[1]) + '/' + Number(dtM[2]) : '';
    const key = card + '|' + amount + '|' + payDate;
    if ((amount > 0 || payDate) && !seenBill[key]) {
      seenBill[key] = 1;
      bills.push({ id: th.getId(), card: card, amount: amount, payDate: payDate, subject: subj.slice(0, 48), at: m.getDate().toISOString() });
    }
  });
  const out = { deliveries: deliveries.slice(0, 5), bills: bills.slice(0, 5) };
  cache.put('lifeMail', JSON.stringify(out), 15 * 60);
  return out;
}

/* --- ポモドーロ作業ログ ＋ 週間ふり返り --- */
function focusSheet_() {
  const ss = getSheet_();
  let sh = ss.getSheetByName('focus');
  if (!sh) {
    sh = ss.insertSheet('focus');
    sh.getRange(1, 1, 1, 4).setValues([['日付', '記録時刻', 'タスク', '分数']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function pomoLog_(date, task, minutes) {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const mins = Math.max(1, Math.min(180, Number(minutes) || 25));
  const label = String(task || '集中').trim().slice(0, 80);
  focusSheet_().appendRow(["'" + d, new Date(), label, mins]);
  return { ok: true, weekly: getWeeklyReview_(d, getRoutines_()) };
}

function getWeeklyReview_(date, routines) {
  const rts = (routines || getRoutines_()).filter((r) => r.active !== false);
  const checkRows = getSheet_().getSheetByName('checks').getDataRange().getValues().slice(1);
  const doneByDay = {};
  checkRows.forEach((r) => {
    if (!(r[2] === true || String(r[2]).toUpperCase() === 'TRUE')) return;
    const d = normCheckDate_(r[0]);
    if (!d) return;
    (doneByDay[d] = doneByDay[d] || {})[String(r[1])] = true;
  });
  const base = new Date(date + 'T12:00:00+09:00');
  const days = [];
  const daySet = {};
  for (let i = 6; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 86400000);
    const dk = Utilities.formatDate(t, TZ, 'yyyy-MM-dd');
    const dow = Number(Utilities.formatDate(t, TZ, 'u')) % 7;
    daySet[dk] = 1;
    const activeDay = rts.filter((r) => !r.days.length || r.days.indexOf(dow) >= 0);
    const hit = doneByDay[dk] || {};
    const done = activeDay.filter((r) => hit[r.id]).length;
    days.push({ date: dk, dow: dow, done: done, total: activeDay.length });
  }
  // 過去7日間のポモドーロ集計
  const fRows = focusSheet_().getDataRange().getValues().slice(1);
  let weekMin = 0, weekSets = 0, todayMin = 0, todaySets = 0;
  fRows.forEach((r) => {
    const dk = normCheckDate_(r[0]);
    const mins = Number(r[3]) || 0;
    if (!daySet[dk] || mins <= 0) return;
    weekMin += mins; weekSets++;
    if (dk === date) { todayMin += mins; todaySets++; }
  });
  return { days: days, weekMin: weekMin, weekSets: weekSets, todayMin: todayMin, todaySets: todaySets };
}

/* --- 3秒家計簿（Google フォーム連動 ＋ ボード直接入力） --- */
function expenseSheet_() {
  const ss = getSheet_();
  let sh = ss.getSheetByName('expenses');
  if (!sh) {
    sh = ss.insertSheet('expenses');
    sh.getRange(1, 1, 1, 4).setValues([['日時', '金額', 'カテゴリ', 'メモ']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getExpenses_(date) {
  const ym = String(date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')).slice(0, 7);
  const ss = getSheet_();
  const rows = [];
  // 1. expenses シート
  const sh = ss.getSheetByName('expenses');
  if (sh) {
    sh.getDataRange().getValues().slice(1).forEach((r) => {
      if (!r[0] || !r[1]) return;
      const dt = r[0] instanceof Date ? r[0] : new Date(String(r[0]).replace(/^'/, ''));
      if (isNaN(dt.getTime())) return;
      rows.push({ at: dt, amount: Number(String(r[1]).replace(/[^\d.-]/g, '')) || 0, category: String(r[2] || 'その他'), memo: String(r[3] || '') });
    });
  }
  // 2. Google フォーム回答シート（「フォームの回答」で始まるシートがあれば自動で合算）
  ss.getSheets().forEach((s) => {
    if (!/フォームの回答|Form Responses/i.test(s.getName())) return;
    s.getDataRange().getValues().slice(1).forEach((r) => {
      if (!r[0] || !r[1]) return;
      const dt = r[0] instanceof Date ? r[0] : new Date(r[0]);
      if (isNaN(dt.getTime())) return;
      rows.push({ at: dt, amount: Number(String(r[1]).replace(/[^\d.-]/g, '')) || 0, category: String(r[2] || 'その他'), memo: String(r[3] || '') });
    });
  });
  const monthRows = rows.filter((x) => x.amount > 0 && Utilities.formatDate(x.at, TZ, 'yyyy-MM') === ym)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const byCat = {};
  let total = 0;
  monthRows.forEach((x) => { total += x.amount; byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
  return {
    ym: ym,
    total: total,
    budget: Number(PROPS_.getProperty('BUDGET_MONTH')) || 0,
    byCat: byCat,
    recent: monthRows.slice(0, 6).map((x) => ({ at: x.at.toISOString(), amount: x.amount, category: x.category, memo: x.memo.slice(0, 40) })),
  };
}

function expenseAdd_(amount, category, memo) {
  amount = Math.round(Number(amount) || 0);
  if (amount <= 0 || amount > 10000000) throw new Error('金額が正しくありません');
  const cat = String(category || 'その他').trim().slice(0, 20) || 'その他';
  const m = String(memo || '').trim().slice(0, 80);
  expenseSheet_().appendRow([new Date(), amount, cat, m]);
  return { ok: true, expenses: getExpenses_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) };
}

function budgetSet_(budget) {
  const b = Math.max(0, Math.min(10000000, Math.round(Number(budget) || 0)));
  PROPS_.setProperty('BUDGET_MONTH', String(b));
  return { ok: true, expenses: getExpenses_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) };
}

/* --- Google ドライブ × Gemini マルチモーダル自動読み取り（画像/PDF → 家計・予定・タスク・ごみ規則） --- */
function getInboxState_() {
  let log = [];
  try { log = JSON.parse(PROPS_.getProperty('INBOX_LOG') || '[]'); } catch (e) {}
  return { log: log.slice(0, 6), gomiDraft: PROPS_.getProperty('INBOX_GOMI_DRAFT') || '' };
}

/** 定期トリガー（10〜15分おき）またはボードから実行。投入フォルダの画像/PDFを Gemini で読み取って自動登録する */
function processInboxFolder() {
  const apiKey = PROPS_.getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY が未設定です' };
  const folder = getOrCreateFolder_('INBOX_FOLDER_ID', 'おうちボード 投入');
  let doneDir;
  const sub = folder.getFoldersByName('処理済み');
  doneDir = sub.hasNext() ? sub.next() : folder.createFolder('処理済み');
  const fi = folder.getFiles();
  const results = [];
  let processed = 0;
  while (fi.hasNext() && processed < 3) {
    const file = fi.next();
    const mime = String(file.getMimeType() || '');
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) continue;
    if (file.getSize() > 8 * 1024 * 1024) continue;
    try {
      const parsed = geminiAnalyzeFile_(file, mime, apiKey);
      let summary = file.getName();
      if (parsed.kind === 'receipt' && parsed.amount > 0) {
        expenseAdd_(parsed.amount, parsed.category || '食費', parsed.memo || file.getName());
        summary = '家計記帳：' + (parsed.memo || 'レシート') + ' ' + parsed.amount + '円';
      } else if (parsed.kind === 'event' && parsed.title && parsed.start) {
        const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parsed.start) ? parsed.start.slice(0, 16) + ':00+09:00' : '';
        if (iso) {
          event_(parsed.title, iso, !!parsed.all_day, parsed.start.slice(0, 10));
          summary = '予定登録：' + parsed.title + '（' + parsed.start.slice(0, 10) + '）';
        }
      } else if (parsed.kind === 'gomi' && parsed.gomi_rules) {
        PROPS_.setProperty('INBOX_GOMI_DRAFT', String(parsed.gomi_rules).slice(0, 1500));
        summary = 'ごみ規則案を作成（ツールの「ごみの日」に貼り付け可能）';
      } else if (parsed.kind === 'shopping' && Array.isArray(parsed.items) && parsed.items.length) {
        parsed.items.slice(0, 10).forEach((it) => { if (it) taskAdd_(null, String(it), ''); });
        summary = 'ToDo追加：' + parsed.items.slice(0, 5).join('・');
      } else if (parsed.title) {
        taskAdd_(null, parsed.title, parsed.due || '');
        summary = 'タスク登録：' + parsed.title;
      }
      file.moveTo(doneDir);
      results.push({ at: new Date().toISOString(), file: file.getName(), summary: summary });
      processed++;
    } catch (e) {
      console.error('processInboxFolder:', file.getName(), e);
      results.push({ at: new Date().toISOString(), file: file.getName(), summary: '読取失敗：' + String(e.message || e).slice(0, 60) });
    }
  }
  if (results.length) {
    let prev = [];
    try { prev = JSON.parse(PROPS_.getProperty('INBOX_LOG') || '[]'); } catch (e) {}
    PROPS_.setProperty('INBOX_LOG', JSON.stringify(results.concat(prev).slice(0, 12)));
    bust_();
  }
  return { ok: true, processed: processed, inbox: getInboxState_() };
}

function geminiAnalyzeFile_(file, mime, apiKey) {
  const b64 = Utilities.base64Encode(file.getBlob().getBytes());
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const prompt = '今日は ' + today + ' です。この画像またはPDFを読み取り、次のJSON形式だけで返してください。\n' +
    '{"kind":"receipt|event|gomi|shopping|task","amount":0,"category":"食費|日用品|交通費|研究・書籍|交際・趣味|その他","memo":"","title":"","start":"YYYY-MM-DDTHH:mm","all_day":false,"due":"YYYY-MM-DD","items":[],"gomi_rules":""}\n' +
    '- レシートなら kind="receipt"、合計金額を amount、店名や品目を memo に。\n' +
    '- 予定案内やプリントなら kind="event"、title と start（日時）を。\n' +
    '- 自治体のごみカレンダーなら kind="gomi"、gomi_rules に「燃えるごみ 月 木 8:30まで\\n資源ごみ 第2・第4 金」の形式で1行1ルール。\n' +
    '- 買い物リストなら kind="shopping"、items 配列に品目名。\n' +
    '- それ以外は kind="task"、title と due（あれば）。';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Gemini API ' + res.getResponseCode());
  const j = JSON.parse(res.getContentText());
  const txt = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0].text;
  return JSON.parse(txt || '{}');
}

/* --- Google ドキュメント週報の自動生成（毎週日曜夜トリガーまたはボードから実行） --- */
function getLatestWeeklyDoc_() {
  const raw = PROPS_.getProperty('WEEKLY_DOC_LATEST');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function createWeeklyDoc() {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const routines = getRoutines_();
  const wk = getWeeklyReview_(today, routines);
  const exp = getExpenses_(today);
  const evs = getEvents_(today, 7);
  const doc = DocumentApp.create('おうちボード 週報 ' + today);
  const body = doc.getBody();
  body.appendParagraph('おうちボード 週間ふり返り（' + today + '）').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const totalDone = wk.days.reduce((a, b) => a + b.done, 0);
  const totalAll = wk.days.reduce((a, b) => a + b.total, 0);
  const rate = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;
  body.appendParagraph('■ 今週のまとめ');
  body.appendListItem('ルーティン達成率：' + rate + '%（' + totalDone + ' / ' + totalAll + '）');
  body.appendListItem('集中作業（ポモドーロ）：' + wk.weekSets + '回 / 合計 ' + wk.weekMin + '分');
  body.appendListItem('今月の支出：' + exp.total.toLocaleString() + '円' + (exp.budget ? '（予算 ' + exp.budget.toLocaleString() + '円）' : ''));
  body.appendParagraph('■ 日別のルーティン記録');
  wk.days.forEach((d) => { body.appendListItem(d.date + '（' + DOW.charAt(d.dow) + '）：' + d.done + ' / ' + d.total); });
  body.appendParagraph('■ 来週の予定（' + evs.length + '件）');
  evs.slice(0, 15).forEach((e) => { body.appendListItem((e.allDay ? e.start : e.start.slice(0, 16).replace('T', ' ')) + ' ' + e.title); });
  doc.saveAndClose();
  try {
    const dir = getOrCreateFolder_('WEEKLY_FOLDER_ID', 'おうちボード 週報');
    DriveApp.getFileById(doc.getId()).moveTo(dir);
  } catch (e) {}
  const info = { title: doc.getName(), url: doc.getUrl(), at: new Date().toISOString(), rate: rate, weekMin: wk.weekMin };
  PROPS_.setProperty('WEEKLY_DOC_LATEST', JSON.stringify(info));
  return { ok: true, weeklyDoc: info };
}

/* --- Gemini API アシスタント（無料枠対応・JSON構造化で予定/リマインダー/タスク/支出/タイマーを実行） --- */
function sayGemini_(text, apiKey) {
  const now = new Date();
  const context = [
    'いまの日時（日本時間）: ' + Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm') + '（' + DOW.charAt(Number(Utilities.formatDate(now, TZ, 'u')) % 7) + '曜日）',
    safe_(() => dayEventsText_(0)) || '', safe_(() => dayEventsText_(1)) || '',
    safe_(() => weatherText_(0)) || '', safe_(() => weatherText_(1)) || '',
    '未完了メモ: ' + (safe_(getMemos_) || []).filter((m) => !m.done).slice(0, 15).map((m) => m.text).join('、'),
  ].join('\n');
  const prompt = 'あなたは壁掛けiPad「おうちボード」のアシスタントです。利用者のことばを読み取り、次のJSON形式だけで返してください。\n' +
    '{"reply":"日本語1〜2文の短い返事","actions":[{"type":"reminder|event|task|expense|timer","title":"","start":"YYYY-MM-DDTHH:mm","all_day":false,"due":"YYYY-MM-DD","amount":0,"category":"食費","seconds":0}]}\n' +
    '質問（予定・天気など）は下の情報だけで reply に答え actions は空配列に。\n\n' + context + '\n\n利用者: ' + text;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Gemini API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  const j = JSON.parse(res.getContentText());
  const raw = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0].text;
  const out = JSON.parse(raw || '{}');
  const result = { reply: String(out.reply || 'わかりました。'), ai: true };
  (out.actions || []).forEach((a) => {
    const title = String(a.title || '').trim();
    if (a.type === 'timer' && a.seconds > 0) result.timer = { seconds: Number(a.seconds), label: title };
    else if (a.type === 'expense' && a.amount > 0) { expenseAdd_(a.amount, a.category || 'その他', title); result.changed = true; }
    else if (a.type === 'task' && title) { taskAdd_(null, title, a.due || ''); result.changed = true; }
    else if ((a.type === 'reminder' || a.type === 'event') && title && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.start || '')) {
      const iso = a.start.slice(0, 16) + ':00+09:00';
      if (a.type === 'reminder') remind_(title, iso, 30); else event_(title, iso, !!a.all_day, a.start.slice(0, 10));
      result.changed = true;
    }
  });
  return result;
}

/* ========== 日付の読み取り（remind-parse.js と同じもの。直すときは remind-parse.js を直して release.py で入れ直す） ========== */
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
