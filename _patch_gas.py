import re
# 日付の読み取りを Node / ブラウザ / Apps Script で共有できるようにする
p = "remind-parse.js"; s = open(p, encoding="utf-8").read()
if "root.normalizeJa" not in s:
    a = "  root.parseRemind = parseRemind;"
    assert a in s
    s = s.replace(a, a + "\n  root.normalizeJa = normalize;")
    open(p, "w", encoding="utf-8", newline="\n").write(s)
parser = s

p = "gas/Code.gs"; g = open(p, encoding="utf-8").read()
def rep(a, b):
    global g
    assert a in g, a[:70]; g = g.replace(a, b, 1)

rep("const NEWS_RSS = 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja';",
    "const NEWS_RSS = 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja';\n// アシスタントに Claude を使うときのモデル（スクリプトプロパティ ANTHROPIC_API_KEY を入れたときだけ使う）\nconst CLAUDE_MODEL = 'claude-opus-5-5';")
rep("      case 'scenic': return json_(scenic_());",
    "      case 'scenic': return json_(scenic_());\n      case 'say': return json_(say_(p.text));\n      case 'memoAdd': return json_(memoAdd_(p.text));\n      case 'memoSet': return json_(memoSet_(p.id, p.on === '1'));\n      case 'memoDel': return json_(memoDel_(p.id));")
rep("    photos: safe_(getPhotoIds_) || [],",
    "    photos: safe_(getPhotoIds_) || [],\n    memos: safe_(getMemos_) || [],\n    ai: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),")
# 週間天気
rep("'&timezone=Asia%2FTokyo&forecast_days=3';", "'&timezone=Asia%2FTokyo&forecast_days=7';")
rep("  const w = { today: day(0), tomorrow: day(1), hours: hours, fetchedAt: new Date().toISOString() };",
    "  const days = (d.daily && d.daily.time || []).map((t, i) => day(i));\n  const w = { today: day(0), tomorrow: day(1), days: days, hours: hours.slice(0, 72), fetchedAt: new Date().toISOString() };")

g = re.sub(r"\n/\* =+ 日付の読み取り（remind-parse\.js と同じもの.*", "", g, flags=re.S).rstrip() + "\n"
g += r'''
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
''' + parser
open(p, "w", encoding="utf-8", newline="\n").write(g)
