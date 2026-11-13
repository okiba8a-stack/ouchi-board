// 裏方の振り分け（sayRules_）を、Apps Script の部品を作り物に置きかえて試す
const fs = require("fs");
const calls = [];
globalThis.Utilities = { formatDate: (d, tz, f) => { const j = new Date(d.getTime() + 9 * 3600000); const p = (n) => String(n).padStart(2, "0");
  const Y = j.getUTCFullYear(), M = p(j.getUTCMonth() + 1), D = p(j.getUTCDate()), H = j.getUTCHours(), m = p(j.getUTCMinutes()), s = p(j.getUTCSeconds());
  if (f === "yyyy-MM-dd") return `${Y}-${M}-${D}`; if (f === "yyyy-MM-dd'T'HH:mm:ss") return `${Y}-${M}-${D}T${p(H)}:${m}:${s}`; if (f === "H時mm分") return `${H}時${m}分`; return ""; } };
let code = fs.readFileSync("gas/Code.gs", "utf8");
code += `
remind_ = (t, s) => calls.push(["remind", t, Utilities.formatDate(new Date(s), "", "yyyy-MM-dd'T'HH:mm:ss")]);
event_ = (t, s, all, date) => calls.push(["event", t, all ? date : Utilities.formatDate(new Date(s), "", "yyyy-MM-dd'T'HH:mm:ss")]);
memoAdd_ = (t) => calls.push(["memo", t]);
getEvents_ = () => []; getReminders_ = () => [];
getWeather_ = () => ({ today: { code: 1, max: 19, min: 8, pop: 0 }, tomorrow: { code: 61, max: 15, min: 10, pop: 80 }, days: [{ code: 1, max: 19, min: 8, pop: 0 }, { code: 61, max: 15, min: 10, pop: 80 }] });
for (const t of ["タイマー10分 パスタ", "3分タイマー", "今日の予定は？", "明日の天気は", "牛乳を買うってメモして", "メモ 電池", "1週間後にパンチェッタのラップを外す", "明日の15時に歯医者の予定", "あさって飲み会の予定を入れて", "30分後に洗濯物を取り込むって教えて", "トイレットペーパー"]) {
  calls.length = 0; const r = sayRules_(t);
  console.log(t, "→", r.reply, r.timer ? JSON.stringify(r.timer) : "", JSON.stringify(calls));
}
console.log("shift(min)", jstShift_() / 60000);
`;
const calls2 = calls; new Function("calls", code)(calls2);
