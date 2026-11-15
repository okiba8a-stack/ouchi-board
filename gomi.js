/* ごみの日の規則を、1行1つの文から読み取る。
     燃えるごみ 月 木 8:30まで
     資源ごみ 第2・第4 金
     粗大ごみ 第1 水曜日
     古紙 11/5 11/19 12/3        （日付で決まるもの。「11月5日」とも書ける）
     休み 12/30-1/3              （この日は何も出せない。「収集なし」「年末年始」でもよい）
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
    // 日付と期間（「11/5」「12/30-1/3」「11月5日」）を先に取り出す。月日は月*100+日の数で持つ
    const dates = [];
    let rest = src.slice(sp).replace(/(\d{1,2})月(\d{1,2})日/g, "$1/$2").replace(/／/g, "/");
    rest = rest.replace(/(?:\d{4}\/)?(\d{1,2})\/(\d{1,2})(?:\s*[-〜~～]\s*(?:\d{4}\/)?(\d{1,2})\/(\d{1,2}))?/g, (m, a, b, c, d) => {
      const from = Number(a) * 100 + Number(b), to = c ? Number(c) * 100 + Number(d) : from;
      dates.push([from, to]); return " ";
    });
    const off = /^(休み|収集なし|年末年始)$/.test(name);
    let s = rest.replace(/[，、,]/g, "・").replace(/[一二三四五]/g, (c) => String("一二三四五".indexOf(c) + 1));
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
    if (!ok || (!dows.size && !dates.length) || (off && !dates.length)) return null;
    return { name, dows: [...dows].sort(), nths: [...nths].sort(), until, dates, off };
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
  const inRange = (md, [a, b]) => (a <= b ? md >= a && md <= b : md >= a || md <= b);   // 12/30-1/3 のような年またぎも
  function gomiOn(rules, date) {
    const d = new Date(date), nth = Math.ceil(d.getDate() / 7), md = (d.getMonth() + 1) * 100 + d.getDate();
    rules = rules || [];
    if (rules.some((r) => r.off && (r.dates || []).some((x) => inRange(md, x)))) return [];
    return rules.filter((r) => !r.off && (((r.dates || []).some((x) => inRange(md, x))) ||
      (r.dows.indexOf(d.getDay()) >= 0 && (!r.nths.length || r.nths.indexOf(nth) >= 0))));
  }

  function describe(r) {
    const md = (n) => Math.floor(n / 100) + "/" + (n % 100);
    const ds = (r.dates || []).map(([a, b]) => (a === b ? md(a) : md(a) + "〜" + md(b))).join("・");
    const w = r.dows.length ? (r.nths.length ? "第" + r.nths.join("・") + " " : "毎週 ") + r.dows.map((i) => DOW[i]).join("・") : "";
    return (r.off ? "収集なし " : "") + [w, ds].filter(Boolean).join("、") + (r.until ? "（" + r.until + "まで）" : "");
  }

  const api = { parseGomi, gomiOn, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Gomi = api;
})(this);
