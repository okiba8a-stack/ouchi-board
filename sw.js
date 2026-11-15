/* おうちボードの Service Worker。
   つながらないとき（iPad を開き直した直後に Wi-Fi がまだ、など）にも前回の画面を出すため、
   画面の部品を手元に残す。いつもネットを先に見るので、新しい版はふつうに読まれる。
   version.json と裏方（Apps Script）・外の配信は残さない（古い情報を出さないため）。 */
const CACHE = "ouchi-board-v2";
const SHELL = ["./", "index.html", "remind-parse.js", "gomi.js", "sun.js", "manifest.webmanifest", "icon-180.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && /version\.json$/.test(url.pathname)) return;           // 版の確認はいつもネット
  if (!same && !FONT_HOSTS.includes(url.hostname)) return;            // 裏方・天気などは触らない

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // 画面を開くとき（?c=… が付く）は、アドレスの ? 以降を無視して index.html として残す
    const key = req.mode === "navigate" ? new Request(new URL("index.html", self.registration.scope).href) : req;
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(key, res.clone()).catch(() => {});
      return res;
    });
    net.catch(() => {});   // 時間切れで手元の画面を出したあとに失敗しても、警告を出さない
    try {
      // 画面を開くときは、6秒たっても返事がなければ手元の画面を出す（遅い Wi-Fi で真っ白のまま待たない）
      if (req.mode === "navigate") {
        const hit = await cache.match(key, { ignoreSearch: true });
        if (hit) return await Promise.race([net, new Promise((ok) => setTimeout(() => ok(hit), 6000))]);
      }
      return await net;
    } catch (err) {
      const hit = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      if (hit) return hit;
      throw err;
    }
  })());
});
