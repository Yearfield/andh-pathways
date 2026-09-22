// Bump VERSION whenever app files change. Data files (data/*.json) update automatically:
// they are fetched fresh when there is signal and fall back to the saved copy offline.
const VERSION = "andh-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "fonts/ah-400.woff2", "fonts/ah-700.woff2",
  "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", "data/index.json", "data/sources.json"];

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL);
  const idx = await (await fetch("data/index.json", { cache: "no-store" })).json();
  await c.addAll(idx.diagnoses.map(d => "data/" + d.file));
  self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/data/")) {
    // network first, so edits pushed to GitHub show up; offline -> saved copy
    e.respondWith(fetch(e.request, { cache: "no-store" }).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  })));
});
