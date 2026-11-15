/* ごみの日の規則を、1行1つの文から読み取る。
     燃えるごみ 月 木 8:30まで
     資源ごみ 第2・第4 金
     粗大ごみ 第1 水曜日
   ブラウザでは window.Gomi、Node では module.exports で使う。 */
(function (root) {
  const DOW = "日月火水木金土";

  function normalize(s) {
    return String(s || "")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[：]/g, ":").replace(/　/g, " ");
  }

  // 1行を読む。最初の語が名前、残りが曜日など。読めなければ null
  function parseLine(line) {
    const src = normalize(line).replace(/#.*$/, "").trim();
    const sp = src.search(/\s/);
    if (sp < 0) return null;
    const name = src.slice(0, sp);
    if (/^(第|毎|[日月火水木金土](曜日?)?$)/.test(name)) return null;   // 名前の書き忘れ（「第2・第4 金」など）
    let s = src.slice(sp).replace(/[，、,／\/]/g, "・").replace(/[一二三四五]/g, (c) => String("一二三四五".indexOf(c) + 1));
    let until = "";
    s = s.replace(/(\d{1,2}):(\d{2})\s*(まで)?/, (m, h, mi) => { until = Number(h) + ":" + mi; return " "; });
    const nths = new Set(), dows = new Set();
    // 「第2・第4」「第2・4」「第1,3」
    s = s.replace(/第\s*(\d)((?:\s*・\s*(?:第\s*)?\d)*)/g, (m) => {
      (m.match(/\d/g) || []).forEach((d) => { const n = Number(d); if (n >= 1 && n <= 5) nths.add(n); });
      return " ";
    });
    s = s.replace(/毎週|毎/g, " ");
    let ok = true;
    s.split(/[\s・]+/).filter(Boolean).forEach((w) => {
      const m = w.match(/^([日月火水木金土]+)(曜日?)?$/);
      if (m) [...m[1]].forEach((c) => dows.add(DOW.indexOf(c))); else ok = false;
    });
    if (!ok || !dows.size) return null;
    return { name, dows: [...dows].sort(), nths: [...nths].sort(), until };
  }

  function parseGomi(text) {
    const rules = [], bad = [];
    String(text || "").split(/\r?\n/).forEach((line) => {
      if (!normalize(line).replace(/#.*$/, "").trim()) return;
      const r = parseLine(line);
      if (r) rules.push(r); else bad.push(line.trim());
    });
    return { rules, bad };
  }

  // その日に出せるもの
  function gomiOn(rules, date) {
    const d = new Date(date), nth = Math.ceil(d.getDate() / 7);
    return (rules || []).filter((r) => r.dows.indexOf(d.getDay()) >= 0 && (!r.nths.length || r.nths.indexOf(nth) >= 0));
  }

  function describe(r) {
    const w = r.dows.map((i) => DOW[i]).join("・");
    return (r.nths.length ? "第" + r.nths.join("・") + " " : "毎週 ") + w + (r.until ? "（" + r.until + "まで）" : "");
  }

  const api = { parseGomi, gomiOn, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Gomi = api;
})(this);
