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
eq(rules[0], { name: "燃えるごみ", dows: [1, 4], nths: [], until: "8:30" }, "燃えるごみ");
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
process.exit(fail ? 1 : 0);
