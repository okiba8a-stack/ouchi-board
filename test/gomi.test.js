// node test/gomi.test.js
const { parseGomi, gomiOn, describe } = require("../gomi.js");
let fail = 0;
const eq = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { fail++; console.log("NG", msg, A, "!=", B); } else console.log("ok", msg); };

const { rules, bad } = parseGomi(`
# 日野市の例
燃えるごみ 月 木 8:30まで
プラスチック 水曜日
資源ごみ 第2・第4 金
びん・缶 第１，３ 火曜
粗大ごみ 第二 土
月見の会
`);
eq(rules.length, 5, "5つ読める");
eq(bad, ["月見の会"], "曜日がない行は読めない行に入る");
eq(rules[0], { name: "燃えるごみ", dows: [1, 4], nths: [], until: "8:30", dates: [], off: false }, "燃えるごみ");
eq(rules[1].dows, [3], "水曜日");
eq([rules[2].name, rules[2].nths, rules[2].dows], ["資源ごみ", [2, 4], [5]], "第2・第4 金");
eq([rules[3].name, rules[3].nths, rules[3].dows], ["びん・缶", [1, 3], [2]], "全角数字とカンマ");
eq([rules[4].nths, rules[4].dows], [[2], [6]], "漢数字の第二");
eq(describe(rules[0]), "毎週 月・木（8:30まで）", "説明");
eq(describe(rules[2]), "第2・4 金", "説明（第n）");

const on = (y, m, d) => gomiOn(rules, new Date(y, m - 1, d)).map((r) => r.name);
eq(on(2026, 11, 16), ["燃えるごみ"], "11/16(月)");
eq(on(2026, 11, 18), ["プラスチック"], "11/18(水)");
eq(on(2026, 11, 13), ["資源ごみ"], "11/13(金)＝第2金曜");
eq(on(2026, 11, 20), [], "11/20(金)＝第3金曜は無し");
eq(on(2026, 11, 3), ["びん・缶"], "11/3(火)＝第1火曜");
eq(on(2026, 11, 14), ["粗大ごみ"], "11/14(土)＝第2土曜");
eq(parseGomi("").rules, [], "空");
eq(parseGomi("燃えるごみ 月木").rules[0].dows, [1, 4], "曜日をつなげて書く");
eq(parseGomi("燃えるごみ 月 ときどき").bad.length, 1, "知らない語がある行は読めない行に入る");
eq(parseGomi("第2・第4 金").bad.length, 1, "名前の書き忘れは読めない行");
eq(parseGomi("月 木").bad.length, 1, "曜日だけの行は読めない行");
// 日付で決まるもの・休み
const r2 = parseGomi(["燃えるごみ 月 木", "古紙 11/5 11月19日 12/3", "休み 12/30-1/3", "休み 12/31"].join("\n"));
eq(r2.bad, [], "日付と休みが読める");
const on2 = (y, m, d) => gomiOn(r2.rules, new Date(y, m - 1, d)).map((r) => r.name);
eq(on2(2026, 11, 5), ["燃えるごみ", "古紙"], "11/5(木) は燃えるごみと古紙");
eq(on2(2026, 11, 19), ["燃えるごみ", "古紙"], "11月19日 の書き方");
eq(on2(2026, 12, 31), [], "12/31(木) は休み");
eq(on2(2027, 1, 4), ["燃えるごみ"], "1/4(月) は休み明け");
eq(on2(2027, 1, 1), [], "年またぎの休み");
eq(describe(r2.rules[1]), "11/5・11/19・12/3", "日付の説明");
eq(describe(r2.rules[2]), "収集なし 12/30〜1/3", "休みの説明");
eq(parseGomi("休み 月").bad.length, 1, "日付のない休みは読めない行");
process.exit(fail ? 1 : 0);
