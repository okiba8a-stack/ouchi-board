// TZ=Asia/Tokyo node test/sun.test.js （国立天文台の東京の値と ±2分で比べる）
process.env.TZ = "Asia/Tokyo";
const { sunTimes } = require("../sun.js");
let fail = 0;
const hm = (d) => d.getHours() * 60 + d.getMinutes();
[[6, 21, "4:25", "19:00"], [12, 22, "6:47", "16:32"], [3, 20, "5:45", "17:53"]].forEach(([m, d, r, s]) => {
  const t = sunTimes(new Date(2026, m - 1, d), 35.6895, 139.6917);
  const toMin = (x) => { const [h, mi] = x.split(":").map(Number); return h * 60 + mi; };
  const ok = Math.abs(hm(t.rise) - toMin(r)) <= 2 && Math.abs(hm(t.set) - toMin(s)) <= 2;
  if (!ok) fail++;
  console.log(ok ? "ok" : "NG", `${m}/${d}`, t.rise.toTimeString().slice(0, 5), t.set.toTimeString().slice(0, 5));
});
process.exit(fail ? 1 : 0);
