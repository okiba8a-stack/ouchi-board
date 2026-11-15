/* 日の出・日の入りの時刻を端末で計算する（NOAA の近似式。誤差は1〜2分）。
   ブラウザでは window.sunTimes、Node では module.exports で使う。 */
(function (root) {
  const rad = Math.PI / 180;
  // date の日（端末の時刻での日付）の日の出・日の入りを Date で返す。白夜・極夜は null
  function sunTimes(date, lat, lon) {
    const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(d0.getFullYear(), 0, 1);
    const doy = Math.round((d0 - start) / 864e5) + 1;
    const g = 2 * Math.PI / 365 * (doy - 1);   // 正午の年の角度
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (cosH > 1 || cosH < -1) return { rise: null, set: null };
    const ha = Math.acos(cosH) / rad;
    const utcMin = (sign) => 720 - 4 * (lon + sign * ha) - eqt;   // その日の UTC 0時からの分
    const utc0 = Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate());
    return { rise: new Date(utc0 + utcMin(1) * 60000), set: new Date(utc0 + utcMin(-1) * 60000) };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { sunTimes };
  else root.sunTimes = sunTimes;
})(this);
