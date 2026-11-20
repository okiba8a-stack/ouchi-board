// node test/logic.test.js
const {
  WARN, isNight, nightPixelShift, rainLine, baseComment,
  daysDiff, parseSince, everyLabel, parseCd, warnFrom, areaFrom,
  departInfo, pomodoroNext, budgetSummary, parseQuickInput, extractLifeFromMail,
} = require("../board-logic.js");
const { parseRemind, normalize } = require("../remind-parse.js");

let fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { fail++; console.log("NG", msg, A, "!=", B); }
  else console.log("ok", msg);
};

// isNight
eq(isNight(new Date(2026, 10, 20, 23, 0), { from: "23:00", to: "06:00", off: false }), true, "23:00 は夜");
eq(isNight(new Date(2026, 10, 20, 5, 59), { from: "23:00", to: "06:00", off: false }), true, "05:59 は夜");
eq(isNight(new Date(2026, 10, 20, 6, 0), { from: "23:00", to: "06:00", off: false }), false, "06:00 は朝");
eq(isNight(new Date(2026, 10, 20, 12, 0), { from: "23:00", to: "06:00", off: false }), false, "12:00 は昼");
eq(isNight(new Date(2026, 10, 20, 2, 0), { from: "23:00", to: "06:00", off: true }), false, "off なら夜にならない");
eq(isNight(new Date(2026, 10, 20, 2, 0), { from: "01:00", to: "05:00", off: false }), true, "日またぎなしの範囲");
eq(isNight(new Date(2026, 10, 20, 23, 0), { from: "23:00", to: "23:00", off: false }), false, "開始=終了なら false");

// nightPixelShift
const s1 = nightPixelShift(new Date(2026, 10, 20, 23, 0, 0), 10);
const s2 = nightPixelShift(new Date(2026, 10, 20, 23, 1, 59), 10);
const s3 = nightPixelShift(new Date(2026, 10, 20, 23, 2, 0), 10);
eq(s1, s2, "同じ2分枠ではシフト量が変わらない");
eq(s1.x !== s3.x || s1.y !== s3.y, true, "2分経つとシフト量が変わる");
eq(Math.abs(s1.x) <= 10 && Math.abs(s1.y) <= 7, true, "シフト量は指定範囲内");

// rainLine & baseComment
const mkHours = (baseDate, specs) => specs.map(([offH, pop, code]) => {
  const d = new Date(baseDate.getTime() + offH * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return { time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`, pop, code: code || 0 };
});
const morning = new Date(2026, 10, 20, 8, 15);
eq(
  rainLine({ hours: mkHours(new Date(2026, 10, 20, 8, 0), [[0, 0], [1, 10], [2, 20], [3, 60, 61], [4, 70, 61]]) }, morning),
  "11時ごろから雨の予報（降水確率60%）。洗濯物は10時までに取りこんで。",
  "午前から降り出し＋洗濯物案内"
);
eq(
  rainLine({ hours: mkHours(new Date(2026, 10, 20, 8, 0), [[0, 70, 61], [1, 60, 61], [2, 20, 3]]) }, morning),
  "雨は10時ごろまでの予報です。",
  "いま雨で10時に止む"
);
eq(
  rainLine({ hours: mkHours(new Date(2026, 10, 20, 8, 0), [[0, 80, 73], [1, 70, 73], [2, 60, 73]]) }, morning),
  "雪はしばらく続く予報です。",
  "雪が続く"
);
eq(
  rainLine({ hours: mkHours(new Date(2026, 10, 20, 8, 0), Array.from({ length: 12 }, (_, i) => [i, 10])) }, morning),
  "夕方まで雨の心配はなさそう。洗濯日和です。",
  "午前中ずっと低確率なら洗濯日和"
);
eq(
  baseComment("傘はいらなそうです。朝晩冷えます。", "15時ごろから雨の予報（降水確率60%）。"),
  "朝晩冷えます。",
  "雨予報があるときは傘はいらなそうを外す"
);
eq(
  baseComment("傘はいらなそうです。朝晩冷えます。", "夕方まで雨の心配はなさそう。洗濯日和です。"),
  "傘はいらなそうです。朝晩冷えます。",
  "洗濯日和なら元のコメントを残す"
);

// parseSince & everyLabel
eq(parseSince("シーツ交換 14日ごと", "2026-11-20", normalize), { t: "シーツ交換", d: "2026-11-20", every: 14 }, "14日ごと");
eq(parseSince("枕カバー 2日に1回", "2026-11-20", normalize), { t: "枕カバー", d: "2026-11-20", every: 2 }, "2日に1回");
eq(parseSince("排水溝 月に1回", "2026-11-20", normalize), { t: "排水溝", d: "2026-11-20", every: 30 }, "月に1回");
eq(parseSince("フィルター 隔週", "2026-11-20", normalize), { t: "フィルター", d: "2026-11-20", every: 14 }, "隔週");
eq(parseSince("健康診断 年に1回", "2026-11-20", normalize), { t: "健康診断", d: "2026-11-20", every: 365 }, "年に1回");
eq(parseSince("水やり 1日おき", "2026-11-20", normalize), { t: "水やり", d: "2026-11-20", every: 2 }, "1日おき→2日");
eq(parseSince("ビタミンB12", "2026-11-20", normalize), { t: "ビタミンB12", d: "2026-11-20", every: 0 }, "数字が名前の一部なら周期なし");
eq(everyLabel(1), "毎日", "label 毎日");
eq(everyLabel(7), "週に1回", "label 週1");
eq(everyLabel(14), "2週間に1回", "label 2週間");
eq(everyLabel(30), "月に1回", "label 月1");
eq(everyLabel(365), "年に1回", "label 年1");
eq(everyLabel(10), "10日に1回", "label 10日");

// parseCd & daysDiff
eq(parseCd("旅行 12/20", "2026-11-20", normalize), { t: "旅行", d: "2026-12-20" }, "今年のカウントダウン");
eq(parseCd("誕生日 1月5日", "2026-11-20", normalize), { t: "誕生日", d: "2027-01-05" }, "過ぎた月日は来年");
eq(parseCd("卒業 2027/3/20", "2026-11-20", normalize), { t: "卒業", d: "2027-03-20" }, "年指定");
eq(parseCd("存在しない日 2/30", "2026-11-20", normalize), null, "2/30 は拒否");
eq(daysDiff("2026-11-20", "2026-12-20"), 30, "日数差 30日");

// warnFrom & areaFrom
const sampleReports = [
  { reportDatetime: "2026-11-20T09:00:00+09:00", warning: { class20Items: [{ areaCode: "1321200", kinds: [{ code: "14", status: "発表" }] }] } },
  { reportDatetime: "2026-11-20T10:00:00+09:00", warning: { class20Items: [{ areaCode: "1321200", kinds: [{ code: "14", status: "継続" }, { code: "03", status: "発表" }, { code: "15", status: "解除" }] }] } },
];
eq(warnFrom(sampleReports, "1321200"), [WARN["03"], WARN["14"]], "最新レポートから解除を除きレベル降順で抽出");
const sampleArea = {
  class20s: { "1321200": { name: "日野市", parent: "130013" }, "1410000": { name: "横浜市", parent: "140011" } },
  class15s: { "130013": { parent: "130010" }, "140011": { parent: "140010" } },
  class10s: { "130010": { parent: "130000" }, "140010": { parent: "140000" } },
};
eq(areaFrom(sampleArea, "東京都日野市"), { place: "東京都日野市", area: "1321200", office: "130000" }, "areaFrom 日野市");
eq(areaFrom(sampleArea, "神奈川県横浜市港北区"), { place: "神奈川県横浜市港北区", area: "1410000", office: "140000" }, "areaFrom 横浜市");
eq(areaFrom(sampleArea, "不明な場所"), null, "areaFrom 不明");

// departInfo（Google マップ所要時間からの出発逆算）
const dep1 = departInfo(new Date(2026, 10, 20, 13, 0), 40, new Date(2026, 10, 20, 12, 5), 5);
eq([dep1.leaveHM, dep1.minsLeft, dep1.urgent, dep1.text], ["12:15", 10, true, "12:15出発（あと10分）"], "出発10分前は urgent");
const dep2 = departInfo(new Date(2026, 10, 20, 13, 0), 40, new Date(2026, 10, 20, 12, 20), 5);
eq([dep2.leaveHM, dep2.urgent, dep2.text], ["12:15", true, "12:15出発（もう出発の時間）"], "出発時刻を過ぎたら案内変更");

// pomodoroNext
eq(pomodoroNext("work", 0), { phase: "break", minutes: 5, doneSets: 1, label: "休憩" }, "1セット完了→5分休憩");
eq(pomodoroNext("work", 3), { phase: "longBreak", minutes: 15, doneSets: 4, label: "長い休憩" }, "4セット完了→15分長休憩");
eq(pomodoroNext("break", 1), { phase: "work", minutes: 25, doneSets: 1, label: "集中" }, "休憩後→25分集中");

// budgetSummary
eq(budgetSummary(45000, 50000, "2026-11-15"), { total: 45000, budget: 50000, pct: 90, remain: 5000, pacePct: 50, over: false, warn: true }, "予算85%以上で warn");
eq(budgetSummary(55000, 50000, "2026-11-15").over, true, "予算超過で over");

// parseQuickInput
const qNow = new Date(2026, 10, 20, 10, 0);
eq(parseQuickInput("昼ごはん 850円", qNow, parseRemind, normalize), { kind: "expense", amount: 850, category: "食費", memo: "昼ごはん" }, "クイック入力：支出（食費）");
eq(parseQuickInput("11/25までにゼミ資料を提出", qNow, parseRemind, normalize), { kind: "task", title: "ゼミ資料を提出", due: "2026-11-25" }, "クイック入力：締切つきタスク");
eq(parseQuickInput("明日15時 歯医者", qNow, parseRemind, normalize).kind, "event", "クイック入力：予定");
eq(parseQuickInput("1時間後に洗濯物を干すって教えて", qNow, parseRemind, normalize).kind, "remind", "クイック入力：リマインダー");
eq(parseQuickInput("牛乳を買う", qNow, parseRemind, normalize), { kind: "task", title: "牛乳", due: "", shopping: true }, "クイック入力：買い物");

// extractLifeFromMail
const life = extractLifeFromMail([
  { subject: "Amazon.co.jp 配達予定のお知らせ", from: "Amazon <auto@amazon.co.jp>", snippet: "本日 14:00-16:00 にお届け予定です", date: "2026-11-20T07:00:00Z" },
  { subject: "お荷物お届け予定のお知らせ", from: "ヤマト運輸", snippet: "午前中のお届け予定", date: "2026-11-20T06:00:00Z" },
  { subject: "配達完了のお知らせ", from: "ヤマト運輸", snippet: "お届け済みです", date: "2026-11-20T05:00:00Z" },
  { subject: "お支払予定金額のご案内", from: "楽天カード", snippet: "11月27日のお引き落とし金額は 89,900円 です。", date: "2026-11-18T02:00:00Z" },
]);
eq(life.deliveries.length, 2, "配達完了を除き2件の宅配を抽出");
eq([life.deliveries[0].carrier, life.deliveries[0].window], ["Amazon", "14-16時"], "Amazon 時間帯抽出");
eq([life.deliveries[1].carrier, life.deliveries[1].window], ["ヤマト運輸", "午前中"], "ヤマト 午前中抽出");
eq(life.bills.length, 1, "請求1件抽出");
eq([life.bills[0].card, life.bills[0].amount, life.bills[0].payDate], ["楽天カード", 89900, "11/27"], "楽天カード 金額・引落日抽出");

console.log(fail ? `\n${fail} 件失敗` : "\nすべて成功");
process.exit(fail ? 1 : 0);
