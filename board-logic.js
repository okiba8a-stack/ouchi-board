/* おうちボードの画面ロジック（天気の雨予報文・ときどきやること・カウントダウン・気象警報・夜間判定など）。
   ブラウザでは window.BoardLogic、Node では module.exports で使う。 */
(function (root) {
  const SNOW = new Set([71, 73, 75, 77, 85, 86]);

  const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(" ");

  const WARN = (() => {
    const t = {};
    const put = (codes, names) => codes.forEach((c, i) => { if (c) t[c] = { name: names[i], level: [50, 40, 30, 20][i] }; });
    put(["33", "43", "03", "10"], ["レベル5大雨特別警報", "レベル4大雨危険警報", "レベル3大雨警報", "レベル2大雨注意報"]);
    put(["39", "49", "09", "29"], ["レベル5土砂災害特別警報", "レベル4土砂災害危険警報", "レベル3土砂災害警報", "レベル2土砂災害注意報"]);
    put(["38", "48", "08", "19"], ["レベル5高潮特別警報", "レベル4高潮危険警報", "レベル3高潮警報", "レベル2高潮注意報"]);
    put(["35", "", "05", "15"], ["暴風特別警報", "", "暴風警報", "強風注意報"]);
    put(["32", "", "02", "13"], ["暴風雪特別警報", "", "暴風雪警報", "風雪注意報"]);
    put(["36", "", "06", "12"], ["大雪特別警報", "", "大雪警報", "大雪注意報"]);
    put(["37", "", "07", "16"], ["波浪特別警報", "", "波浪警報", "波浪注意報"]);
    [["14", "雷"], ["17", "融雪"], ["20", "濃霧"], ["21", "乾燥"], ["22", "なだれ"], ["23", "低温"], ["24", "霜"], ["25", "着氷"], ["26", "着雪"]].forEach(([c, n]) => {
      t[c] = { name: n + "注意報", level: 20 };
    });
    return t;
  })();

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // 夜に暗くする時間帯（pref = { from: "23:00", to: "06:00", off: false }）
  function isNight(d, pref) {
    const n = Object.assign({ from: "23:00", to: "06:00", off: false }, pref || {});
    if (n.off) return false;
    const toMin = (t) => { const [a, b] = String(t).split(":").map(Number); return a * 60 + (b || 0); };
    const now = d.getHours() * 60 + d.getMinutes(), a = toMin(n.from), b = toMin(n.to);
    return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b;
  }

  // 夜間表示の焼き付き防止：2分ごとに時計ブロックを [-maxPx, +maxPx] の範囲で微細に動かす
  function nightPixelShift(d, maxPx) {
    const r = maxPx || 10;
    const slot = Math.floor(d.getTime() / (2 * 60 * 1000));
    const x = Math.round(Math.sin(slot * 1.7) * r);
    const y = Math.round(Math.cos(slot * 1.13) * Math.round(r * 0.7));
    return { x, y };
  }

  // 発表された毎時の降水確率から、雨・雪の降り出し／止む時刻のひとことを作る
  function rainLine(w, nowArg) {
    const now = nowArg ? new Date(nowArg) : new Date(), h0 = new Date(now);
    h0.setMinutes(0, 0, 0);
    const hrs = ((w && w.hours) || []).filter((h) => new Date(h.time) >= h0).slice(0, 24);
    if (!hrs.length) return "";
    const wet = (h) => (h.pop ?? 0) >= 50;
    const kind = (h) => (SNOW.has(h.code) ? "雪" : "雨");
    const d0 = new Date(now);
    d0.setHours(0, 0, 0, 0);
    const when = (h) => {
      const t = new Date(h.time);
      const dd = Math.round((new Date(t).setHours(0, 0, 0, 0) - d0) / 864e5);
      return (dd === 1 ? "あしたの" : dd >= 2 ? "あさっての" : "") + t.getHours() + "時";
    };
    if (wet(hrs[0])) {
      const i = hrs.findIndex((h) => !wet(h));
      return i < 0 ? `${kind(hrs[0])}はしばらく続く予報です。` : `${kind(hrs[0])}は${when(hrs[i])}ごろまでの予報です。`;
    }
    const i = hrs.slice(0, 18).findIndex(wet);
    if (i >= 0) {
      const h = hrs[i], t = new Date(h.time);
      const laundry = t.getDate() === now.getDate() && now.getHours() >= 6 && t.getHours() >= 9 && t.getHours() <= 19
        ? `洗濯物は${t.getHours() - 1}時までに取りこんで。` : "";
      return `${when(h)}ごろから${kind(h)}の予報（降水確率${h.pop}%）。${laundry}`;
    }
    const hr = now.getHours();
    if (hr >= 5 && hr < 12 && hrs.slice(0, 18 - hr).every((h) => (h.pop ?? 0) < 30)) {
      return "夕方まで雨の心配はなさそう。洗濯日和です。";
    }
    return "";
  }

  // 裏方のひとこと（1日の降水確率から作る）が、毎時の予報から作った雨の一文と食い違うときは傘の文を外す
  function baseComment(comment, rl) {
    let c = String(comment || "");
    if (/予報/.test(rl || "")) c = c.replace(/傘はいらなそうです。?/, "");
    return c.trim();
  }

  // 2つの YYYY-MM-DD の日数差（to - from）
  function daysDiff(fromYmd, toYmd) {
    return Math.round((new Date(toYmd + "T00:00:00") - new Date(fromYmd + "T00:00:00")) / 864e5);
  }

  // 「シーツ交換 14日ごと」「枕カバー 2日に1回」「排水溝 月に1回」「布団干し 10」
  function parseSince(text, todayStr, normalizeFn) {
    const s = normalizeFn ? normalizeFn(String(text || "")) : String(text || "");
    let every = 0, t = s;
    const unit = (u) => (/週/.test(u || "") ? 7 : /月/.test(u || "") ? 30 : /年/.test(u || "") ? 365 : 1);
    const m = s.match(/[\s、,]*(\d+)\s*(日|週間?|か月|ヶ月|カ月|ヵ月|月|年)?\s*(ごと|毎|おき|に\s*(1|一)\s*(回|度))?\s*$/);
    if (m && m.index > 0 && (m[2] || m[3] || /\s/.test(s.slice(m.index - 1, m.index + 1)))) {
      every = Number(m[1]) * unit(m[2]) + (m[3] === "おき" && unit(m[2]) === 1 ? 1 : 0);
      t = s.slice(0, m.index);
    } else if (/(毎月|月[にい]?\s*(1|一)\s*[回度]?)\s*$/.test(s)) {
      every = 30; t = s.replace(/[\s、,]*(毎月|月[にい]?\s*(1|一)\s*[回度]?)\s*$/, "");
    } else if (/(毎週|週[にい]?\s*(1|一)\s*[回度]?)\s*$/.test(s)) {
      every = 7; t = s.replace(/[\s、,]*(毎週|週[にい]?\s*(1|一)\s*[回度]?)\s*$/, "");
    } else if (/隔週\s*$/.test(s)) {
      every = 14; t = s.replace(/[\s、,]*隔週\s*$/, "");
    } else if (/(毎年|年[にい]?\s*(1|一)\s*[回度]?)\s*$/.test(s)) {
      every = 365; t = s.replace(/[\s、,]*(毎年|年[にい]?\s*(1|一)\s*[回度]?)\s*$/, "");
    }
    t = t.trim();
    return t ? { t, d: todayStr, every } : null;
  }

  function everyLabel(n) {
    if (n === 1) return "毎日";
    if (n % 365 === 0) return n === 365 ? "年に1回" : n / 365 + "年に1回";
    if (n % 30 === 0) return n === 30 ? "月に1回" : n / 30 + "か月に1回";
    if (n % 7 === 0) return n === 7 ? "週に1回" : n / 7 + "週間に1回";
    return n + "日に1回";
  }

  // 「旅行 12/20」「誕生日 1月5日」「卒業 2027/3/20」。年がなく、今年の日付が過ぎていれば来年
  function parseCd(text, todayStr, normalizeFn) {
    const s = (normalizeFn ? normalizeFn(String(text || "")) : String(text || "")).replace(/(\d{1,2})月(\d{1,2})日/, "$1/$2");
    const m = s.match(/(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const t = s.replace(m[0], "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    const now = new Date(todayStr + "T00:00:00");
    let d = new Date(Number(m[1] || now.getFullYear()), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;   // 2/30 など
    if (!m[1] && d < now) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    return { t, d: ymd(d) };
  }

  // 気象庁 bosai の令和8年形式レポートから対象区域の警報・注意報を取り出す
  function warnFrom(reports, area) {
    const list = Array.isArray(reports) ? reports : [reports];
    const latest = list.filter((r) => r && r.warning).sort((a, b) => String(a.reportDatetime).localeCompare(String(b.reportDatetime))).pop();
    if (!latest) return [];
    const it = (latest.warning.class20Items || []).find((a) => a.areaCode === area);
    if (!it) return [];
    return (it.kinds || []).filter((k) => k.code && WARN[k.code] && !/解除|なし/.test(k.status || "")).map((k) => WARN[k.code]).sort((a, b) => b.level - a.level);
  }

  // 「東京都日野市」→ 気象庁 area.json から市区町村コード・府県コードを解決
  function areaFrom(area, place) {
    const pi = PREFS.findIndex((p) => String(place || "").startsWith(p));
    if (pi < 0) return null;
    const pre = String(pi + 1).padStart(2, "0"), rest = place.slice(PREFS[pi].length);
    let best = null;
    Object.entries((area && area.class20s) || {}).forEach(([code, v]) => {
      if (!code.startsWith(pre)) return;
      const nm = v.name.replace(/(北部|南部|東部|西部|中部)$/, "");
      if (rest.startsWith(nm) && (!best || nm.length > best.len)) best = { code, len: nm.length };
    });
    if (!best) return null;
    const c15 = area.class20s[best.code].parent;
    const c10 = area.class15s[c15] && area.class15s[c15].parent;
    const off = area.class10s[c10] && area.class10s[c10].parent;
    return off ? { place, area: best.code, office: off } : null;
  }

  const api = {
    WARN, PREFS,
    isNight, nightPixelShift,
    rainLine, baseComment,
    daysDiff, parseSince, everyLabel, parseCd,
    warnFrom, areaFrom,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoardLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
