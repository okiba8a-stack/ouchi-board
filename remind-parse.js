/* 「1週間後にパンチェッタのラップを外す」のような文から、日時と内容を取り出す。
   ブラウザでは window.parseRemind、Node では module.exports で使う。 */
(function (root) {
  const KANJI = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  const DOW = "日月火水木金土";

  // 全角数字・漢数字（〜九十九）を半角に
  function normalize(s) {
    s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
         .replace(/[：]/g, ":").replace(/[／]/g, "/").replace(/　/g, " ");
    return s.replace(/[〇零一二三四五六七八九十]+/g, (m) => {
      if (!/^[〇零一二三四五六七八九]?十?[〇零一二三四五六七八九]?$/.test(m)) return m;
      if (m.indexOf("十") < 0) return m.length === 1 ? String(KANJI[m]) : m;
      const [a, b] = m.split("十");
      return String((a ? KANJI[a] : 1) * 10 + (b ? KANJI[b] : 0));
    });
  }

  function parseRemind(text, now) {
    now = now ? new Date(now) : new Date();
    const src = normalize(String(text || "")).trim();
    if (!src) return null;
    let rest = src;
    // 取り出した部分は目印 \u0001 に置きかえ、あとで直後の「に」「の」ごと消す
    const cut = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], "\u0001"); return m; };

    let date = null;      // 日付（0時）
    let exact = null;     // 「3時間後」などの正確な時刻
    let m;
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    if ((m = cut(/(\d+)\s*時間\s*後/))) exact = new Date(now.getTime() + Number(m[1]) * 3600000);
    else if ((m = cut(/(\d+)\s*分\s*後/))) exact = new Date(now.getTime() + Number(m[1]) * 60000);
    else if ((m = cut(/(\d+)\s*日\s*後/))) date = addDays(today0, Number(m[1]));
    else if ((m = cut(/(\d+)\s*週間?\s*後/))) date = addDays(today0, Number(m[1]) * 7);
    else if ((m = cut(/(\d+)\s*[かカヶケ箇]?\s*月\s*後/))) date = new Date(today0.getFullYear(), today0.getMonth() + Number(m[1]), today0.getDate());
    else if ((m = cut(/(?:(\d{4})\s*[年\/-]\s*)?(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/))) {
      const y = m[1] ? Number(m[1]) : now.getFullYear();
      date = new Date(y, Number(m[2]) - 1, Number(m[3]));
      if (!m[1] && date < today0) date = new Date(y + 1, Number(m[2]) - 1, Number(m[3]));
    } else if ((m = cut(/(\d{1,2})\s*日\s*(?=[にのは、\s]|$)/))) {
      date = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
      if (date < today0) date = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
    } else if ((m = cut(/(再来週|来週|今週)?\s*の?\s*([日月火水木金土])\s*曜日?/))) {
      const target = DOW.indexOf(m[2]);
      if (m[1]) {
        const weeks = m[1] === "再来週" ? 2 : m[1] === "来週" ? 1 : 0;
        const monday = addDays(today0, -((today0.getDay() + 6) % 7)); // 週は月曜はじまり
        date = addDays(monday, weeks * 7 + ((target + 6) % 7));
      } else {
        let diff = (target - today0.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        date = addDays(today0, diff);
      }
    } else if ((m = cut(/明々後日|しあさって/))) date = addDays(today0, 3);
    else if ((m = cut(/明後日|あさって/))) date = addDays(today0, 2);
    else if ((m = cut(/明日|あした|あす/))) date = addDays(today0, 1);
    else if ((m = cut(/再来週/))) date = addDays(today0, 14);
    else if ((m = cut(/来週/))) date = addDays(today0, 7);
    else if ((m = cut(/来月/))) date = new Date(today0.getFullYear(), today0.getMonth() + 1, today0.getDate());
    else if ((m = cut(/今日|きょう/))) date = today0;

    // 時刻
    let hour = null, minute = 0, timeGiven = false;
    if (!exact) {
      if ((m = cut(/(午前|午後|朝|昼|夕方|夜|晩)?\s*(\d{1,2})\s*時\s*(半|(\d{1,2})\s*分)?/))) {
        hour = Number(m[2]); minute = m[3] === "半" ? 30 : m[4] ? Number(m[4]) : 0;
        if (/午後|夕方|夜|晩/.test(m[1] || "") && hour < 12) hour += 12;
        if (m[1] === "昼" && hour < 6) hour += 12;
        timeGiven = true;
      } else if ((m = cut(/(\d{1,2}):(\d{2})/))) {
        hour = Number(m[1]); minute = Number(m[2]); timeGiven = true;
      } else if ((m = cut(/朝/))) { hour = 8; timeGiven = true; }
      else if ((m = cut(/昼/))) { hour = 12; timeGiven = true; }
      else if ((m = cut(/夕方/))) { hour = 17; timeGiven = true; }
      else if ((m = cut(/夜|晩/))) { hour = 20; timeGiven = true; }
    }

    let start;
    if (exact) start = exact;
    else if (date) start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour == null ? 9 : hour, minute);
    else if (timeGiven) {
      start = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate(), hour, minute);
      if (start <= now) start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, hour, minute);
    } else return { title: cleanTitle(rest), start: null, found: false };

    return { title: cleanTitle(rest), start: start, found: true, timeGiven: !!(exact || timeGiven) };
  }

  function cleanTitle(s) {
    return s
      .replace(/\u0001[\s、,]*[にのはで]?(?=\u0001)/g, "")
      .replace(/\u0001[\s、,]*[にのはで]?/g, " ")
      .replace(/(って|と|を|に)?\s*(教えて|知らせて|リマインドして|覚えて(おいて|て)?|通知して|お願い)(ください|ね|ほしい)?[。！!]*\s*$/, "")
      .replace(/[\s、,]+/g, " ")
      .replace(/([^\x00-\x7f]) (?=[^\x00-\x7f])/g, "$1")
      .replace(/[\s、,]+$/, "")
      .trim();
  }

  root.parseRemind = parseRemind;
  root.normalizeJa = normalize;
  if (typeof module !== "undefined") module.exports = { parseRemind, normalize };
})(typeof window !== "undefined" ? window : globalThis);
