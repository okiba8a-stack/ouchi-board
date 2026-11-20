// node test/logic.test.js
const {
  WARN, isNight, nightPixelShift, rainLine, baseComment,
  daysDiff, parseSince, everyLabel, parseCd, warnFrom, areaFrom,
} = require("../board-logic.js");
const { normalize } = require("../remind-parse.js");

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

console.log(fail ? `\n${fail} 件失敗` : "\nすべて成功");
process.exit(fail ? 1 : 0);
