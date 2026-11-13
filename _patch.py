import re
p = "index.html"; s = open(p, encoding="utf-8").read()
def rep(a, b):
    global s
    assert a in s, a[:70]; s = s.replace(a, b, 1)

# ---------- 見た目 ----------
rep("/* 長押しで開く編集の窓 */", """.as-log { display: flex; flex-direction: column; gap: 6px; max-height: 190px; overflow-y: auto; }
.as-log div { padding: 8px 12px; border-radius: 14px; font-size: 15px; overflow-wrap: anywhere; }
.as-log .me { align-self: flex-end; background: var(--soft); color: var(--muted); }
.as-log .ai { align-self: flex-start; background: rgba(191,227,204,.16); }
.tm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tm { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.tm .left { font-family: var(--font-num); font-weight: 200; font-size: 40px; line-height: 1; font-variant-numeric: tabular-nums; min-width: 3.2em; }
.tm .lbl { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--muted); }
.memo { display: flex; align-items: center; border-bottom: 1px solid var(--line); }
.memo .chk { flex: 1; border-bottom: 0; font-size: 18px; min-height: 52px; padding: 10px 2px; }
.wk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.wk { display: grid; grid-template-columns: 84px 34px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--line); }
.wk:last-child { border-bottom: 0; }
.wk .icon { width: 30px; height: 30px; }
.wk .d { font-size: 14px; color: var(--muted); } .wk .desc { font-size: 15px; }
.wk .t { font-family: var(--font-num); font-weight: 300; font-size: 15px; white-space: nowrap; }
.wk .t i { font-style: normal; color: var(--rain); margin-left: 8px; }
.page:not(.home) .icon .sun, .page:not(.home) .icon .bolt { fill: #ffd98a; }
/* 長押しで開く編集の窓 */""")

# ---------- HTML ----------
rep('  <section class="page" aria-label="ニュース">', '''  <section class="page" aria-label="ツール">
    <div class="page-inner"><div class="cols">
      <div class="col">
        <h2>アシスタント <small id="aiTag"></small></h2>
        <form class="remember" id="asForm" autocomplete="off">
          <div class="rm-row">
            <input type="text" id="asText" placeholder="例：タイマー10分 パスタ／明日の予定は？" enterkeyhint="send" aria-label="アシスタントに頼むこと">
            <button class="btn mic" type="button" id="asMic" hidden aria-pressed="false" aria-label="声で頼む">🎤</button>
          </div>
        </form>
        <div class="as-log" id="asLog" aria-live="polite"></div>
        <label class="allday"><input type="checkbox" id="asSpeak">声で返事する</label>
        <h2 style="margin-top:14px">タイマー</h2>
        <div class="seg" id="tmPresets"></div>
        <ul class="tm-list" id="tmList"></ul>
      </div>
      <div class="col">
        <h2>メモ・買い物 <small id="memoCount"></small></h2>
        <form class="rm-row" id="memoForm" autocomplete="off"><input type="text" id="memoText" placeholder="例：牛乳" enterkeyhint="done" aria-label="メモ" style="flex:1;min-width:0"><button class="btn" type="submit">追加</button></form>
        <ul class="chk-list" id="memoList"></ul>
      </div>
      <div class="col c3">
        <h2>週間天気 <small id="wkPlace"></small></h2>
        <ul class="wk-list" id="wkList"></ul>
      </div>
    </div></div>
  </section>

  <section class="page" aria-label="ニュース">''')
rep('  <button type="button" aria-label="ニュース"></button>\n', '  <button type="button" aria-label="ツール"></button>\n  <button type="button" aria-label="ニュース"></button>\n')
rep('<h2>アラーム</h2>\n    <div class="ring-time" id="ringTime"></div>', '<h2 id="ringHead">アラーム</h2>\n    <div class="ring-time" id="ringTime"></div>')

# ---------- ページ数 4 → 5 ----------
rep("  const LAST = 3;", "  const LAST = 4;")
rep('  $("toSettings").addEventListener("click", () => goTo(3));', '  $("toSettings").addEventListener("click", () => goTo(4));')
rep('    if (e.target.closest("#wx")) openWeather();', '    if (e.target.closest("#timerTag")) goTo(2);\n    else if (e.target.closest("#wx")) openWeather();')

# ---------- 鳴らす部分を、アラームとタイマーで共用にする ----------
rep('''    $("ringTime").textContent = alarm.time; $("ringBg").hidden = false; goTo(0);
    try { if (actx) actx.resume(); } catch (e) {}
    let n = 0; beep(); ringTimer = setInterval(() => { beep(); if (++n > 150) stopRing(); }, 2000);   // 最長5分''',
    '''    ringFor("alarm", alarm.time, null); goTo(0);''')
rep('''    clearInterval(ringTimer); ringTimer = null; $("ringBg").hidden = true;
    if (alarm && !alarm.daily) { alarm = null; store.set("ouchi.alarm", null); }''',
    '''    clearInterval(ringTimer); ringTimer = null; $("ringBg").hidden = true;
    const kind = ringKind, cb = ringDone; ringKind = ringDone = null;
    if (cb) cb();
    if (kind === "alarm" && alarm && !alarm.daily) { alarm = null; store.set("ouchi.alarm", null); }''')
rep("  function checkAlarm(d) {", '''  let ringKind = null, ringDone = null;
  function ringFor(kind, text, onStop) {
    ringKind = kind; ringDone = onStop;
    $("ringHead").textContent = kind === "alarm" ? "アラーム" : "タイマー";
    $("ringTime").textContent = text; $("ringTime").style.fontSize = text.length > 5 ? "44px" : "";
    $("ringBg").hidden = false;
    try { if (actx) actx.resume(); } catch (e) {}
    let n = 0; beep(); ringTimer = setInterval(() => { beep(); if (++n > 150) stopRing(); }, 2000);   // 最長5分
  }
  function checkAlarm(d) {''')

# ---------- ツールの画面 ----------
rep("  /* ---------- 入力欄（リマインダーと予定で共通） ---------- */", r'''  /* ---------- タイマー（この端末の中で動く。いくつでも） ---------- */
  let timers = (store.get("ouchi.timers") || []).filter((t) => t.end > Date.now() - 3600000);
  let timerSig = "";
  const fmtLeft = (ms) => { const s0 = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s0 / 3600), m = Math.floor(s0 % 3600 / 60); return (h ? h + ":" + pad(m) : m) + ":" + pad(s0 % 60); };
  function addTimer(sec, label) {
    unlockAudio();
    timers.push({ id: "t" + Date.now().toString(36), label: label || "", end: Date.now() + sec * 1000 });
    store.set("ouchi.timers", timers); drawTimers();
  }
  function drawTimers() {
    const now = Date.now(), sig = timers.map((t) => t.id).join();
    if (sig !== timerSig) {   // 一覧が変わったときだけ作り直す（ボタンを押しそこねないように）
      timerSig = sig;
      const ul = $("tmList"); ul.textContent = "";
      timers.forEach((t) => {
        const li = el("li", "tm"), left = el("span", "left"); left.dataset.id = t.id;
        const x = el("button", "more", "×"); x.type = "button"; x.setAttribute("aria-label", "このタイマーを消す");
        x.addEventListener("click", () => { timers = timers.filter((y) => y !== t); store.set("ouchi.timers", timers); drawTimers(); });
        li.append(left, el("span", "lbl", t.label), x); ul.append(li);
      });
    }
    document.querySelectorAll("#tmList .left").forEach((sp) => { const t = timers.find((y) => y.id === sp.dataset.id); if (t) sp.textContent = fmtLeft(t.end - now); });
    // 時計の画面にも、いちばん早く鳴るタイマーを出す
    let tag = $("timerTag");
    const next = timers.slice().sort((a, b) => a.end - b.end)[0];
    if (!next) { if (tag) tag.remove(); return; }
    if (!tag) { tag = el("span", "alarm-tag"); tag.id = "timerTag"; }
    tag.textContent = `⏱ ${fmtLeft(next.end - now)}${next.label ? " " + next.label : ""}`;
    if (!tag.isConnected) $("date").append(tag);
  }
  setInterval(() => {
    if (!timers.length) { if (timerSig) drawTimers(); return; }
    const done = timers.find((t) => t.end <= Date.now() && !t.rung);
    if (done && !ringTimer) {
      done.rung = true;
      ringFor("timer", done.label || "時間です", () => { timers = timers.filter((y) => y !== done); store.set("ouchi.timers", timers); drawTimers(); });
    }
    drawTimers();
  }, 500);
  [3, 5, 10, 15, 30].forEach((m) => { const b = el("button", "btn", m + "分"); b.type = "button"; b.addEventListener("click", () => addTimer(m * 60, "")); $("tmPresets").append(b); });
  drawTimers();

  /* ---------- アシスタント（ことばで頼む） ---------- */
  function asLog(who, text) { const d = el("div", who, text); $("asLog").prepend(d); while ($("asLog").children.length > 8) $("asLog").lastChild.remove(); }
  try { $("asSpeak").checked = !!store.get("ouchi.speak"); } catch (e) {}
  $("asSpeak").addEventListener("change", () => store.set("ouchi.speak", $("asSpeak").checked));
  function asReply(text) {
    asLog("ai", text);
    if ($("asSpeak").checked && window.speechSynthesis) {
      try { const u = new SpeechSynthesisUtterance(text); u.lang = "ja-JP"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
    }
  }
  async function ask(text) {
    text = text.trim(); if (!text) return;
    asLog("me", text);
    // タイマーはこの端末だけで済むので、通信しない
    const t = window.normalizeJa(text);
    if (/タイマー/.test(t)) {
      const h = t.match(/(\d+)\s*時間/), m = t.match(/(\d+)\s*分/), sc = t.match(/(\d+)\s*秒/);
      const sec = (h ? h[1] * 3600 : 0) + (m ? m[1] * 60 : 0) + (sc ? Number(sc[1]) : 0);
      if (sec > 0) {
        const label = t.replace(/(\d+)\s*(時間|分|秒)(間|後)?/g, "").replace(/タイマー|セット|かけて|して|お願い|を|の|で|に/g, "").trim();
        addTimer(sec, label); asReply((label ? label + "の" : "") + "タイマーをセットしました。"); return;
      }
    }
    if (DEMO) { asReply("試し表示では、タイマー以外は答えられません。"); return; }
    try {
      const r = await callApi({ action: "say", text });
      if (!r.ok) throw new Error(r.error === "unknown_action" ? "裏方（Apps Script）の更新が必要です" : r.error);
      asReply(r.reply || "わかりました。");
      if (r.timer) addTimer(r.timer.seconds, r.timer.label);
      if (r.changed) refresh();
    } catch (e) { asReply("できませんでした：" + e.message); }
  }
  $("asForm").addEventListener("submit", (ev) => { ev.preventDefault(); const v = $("asText").value; $("asText").value = ""; unlockAudio(); ask(v); });
  {
    const SR2 = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $("asMic");
    if (SR2) {
      mic.hidden = false; let rec = null;
      mic.addEventListener("click", () => {
        if (rec) { rec.stop(); return; }
        unlockAudio();
        try {
          rec = new SR2(); rec.lang = "ja-JP"; rec.interimResults = true; rec.continuous = false;
          let finalText = "";
          rec.onresult = (e) => { let s2 = ""; for (const r of e.results) s2 += r[0].transcript; $("asText").value = s2; finalText = s2; };
          rec.onerror = () => { asLog("ai", "うまく聞き取れませんでした。キーボードのマイクボタンでも入力できます。"); };
          rec.onend = () => { rec = null; mic.setAttribute("aria-pressed", "false"); if (finalText.trim()) { $("asText").value = ""; ask(finalText); } };
          rec.start(); mic.setAttribute("aria-pressed", "true");
        } catch (e) { rec = null; asLog("ai", "この画面では声の入力が使えません。"); }
      });
    }
  }

  /* ---------- メモ・買い物 ---------- */
  function renderMemos() {
    const ul = $("memoList"); ul.textContent = "";
    const list = (data && data.memos) || [];
    $("memoCount").textContent = list.length ? `${list.filter((m) => !m.done).length} 件` : "";
    if (!list.length) ul.append(el("li", "empty", data && !("memos" in data) && !DEMO ? "メモには裏方（Apps Script）の更新が必要です。" : "メモはありません。"));
    list.forEach((m) => {
      const li = el("li", "memo"), b = el("button", "chk"); b.type = "button"; b.setAttribute("aria-pressed", String(!!m.done));
      const box = el("span", "box"); box.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      b.append(box, el("span", "label", m.text));
      b.addEventListener("click", () => { m.done = !m.done; renderMemos(); memoCall({ action: "memoSet", id: m.id, on: m.done ? "1" : "0" }); });
      const x = el("button", "more", "×"); x.type = "button"; x.setAttribute("aria-label", `「${m.text}」を消す`);
      x.addEventListener("click", () => { data.memos = data.memos.filter((y) => y !== m); renderMemos(); memoCall({ action: "memoDel", id: m.id }); });
      li.append(b, x); ul.append(li);
    });
  }
  let memoQueue = Promise.resolve();
  function memoCall(q) {
    if (DEMO) return;
    memoQueue = memoQueue.then(() => callApi(q)).then((r) => { if (!r.ok) throw new Error(r.error); if (r.memos && data) { data.memos = r.memos; renderMemos(); } })
      .catch((e) => { $("statusText").textContent = "メモを保存できませんでした"; refresh(); });
  }
  $("memoForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("memoText").value.trim(); if (!text || !data) return;
    $("memoText").value = "";
    data.memos = (data.memos || []).concat({ id: "tmp" + Date.now(), text, done: false }); renderMemos();
    memoCall({ action: "memoAdd", text });
  });

  /* ---------- 週間天気 ---------- */
  function renderWeek() {
    const ul = $("wkList"); ul.textContent = "";
    const days = (data && data.weather && data.weather.days) || [];
    $("wkPlace").textContent = (data && data.place) || "";
    if (!days.length) { ul.append(el("li", "empty", data && data.weather && !DEMO ? "週間天気には裏方（Apps Script）の更新が必要です。" : "読み込み中…")); return; }
    days.forEach((d, i) => {
      if (!d) return;
      const dt = new Date(d.date + "T00:00:00"), [desc, kind] = WX(d.code), li = el("li", "wk"), t = el("span", "t");
      t.append(`${Math.round(d.max)}° / ${Math.round(d.min)}°`, el("i", null, `${d.pop ?? "—"}%`));
      li.append(el("span", "d", i === 0 ? "きょう" : i === 1 ? "あした" : dayStr(dt)), icon(kind), el("span", "desc", desc), t);
      ul.append(li);
    });
  }

  /* ---------- 入力欄（リマインダーと予定で共通） ---------- */''')
rep("renderReminders(); if (!rtDraft) renderRtEditor();", 'renderReminders(); renderMemos(); renderWeek(); $("aiTag").textContent = data && data.ai ? "Claude が読み取ります" : ""; if (!rtDraft) renderRtEditor();')
# 試し表示のデータ
rep("      weather: { today: { code: 2, max: 19.1, min: 7.8, pop: 0 }, tomorrow: { code: 3, max: 19, min: 11.1, pop: 20 }, hours },",
    '      weather: { today: { code: 2, max: 19.1, min: 7.8, pop: 0 }, tomorrow: { code: 3, max: 19, min: 11.1, pop: 20 }, hours,\n        days: [2, 3, 61, 1, 0, 2, 80].map((code, i) => ({ date: ymd(at(i)), code, max: 19 - i, min: 8 + (i % 3), pop: [0, 20, 80, 10, 0, 20, 60][i] })) },\n      memos: [{ id: "m1", text: "牛乳", done: false }, { id: "m2", text: "単3電池", done: false }, { id: "m3", text: "ラップ", done: true }],')
open(p, "w", encoding="utf-8", newline="\n").write(s)
open('_m.js', 'w', encoding='utf-8').write(re.findall(r'<script>(.*?)</script>', s, re.S)[0])
