// Bump VERSION whenever app files change. Data files (data/*.json) update automatically:
// the saved copy is shown at once and refreshed quietly in the background, so an edit pushed to GitHub shows on the next open.
// Weak or "connected but no internet" signal never holds a page up: with no saved copy the network gets 3 seconds.
const VERSION = "andh-v118";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/jad-logo.webp",
  "fonts/plex-sans-400.woff2", "fonts/plex-sans-700.woff2",
  "fonts/plex-serif-400.woff2", "fonts/plex-serif-700.woff2",
  "calc.js", "links.js", "scores.js", "vitals.js", "anthro.js", "tables.js", "anthro_z.js", "data/who_lms.json", "altmed.js", "formulary.js", "data/formulary/index.json", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", "data/index.json", "data/sources.json", "data/page-map.json", "data/related.json",
  "wheel/gcs-wheel-adult.svg", "wheel/gcs-wheel-child.svg", "wheel/gcs-wheel-infant.svg", "wheel/rass-wheel.svg", "cards/rass.pdf", "cards/wells-pe.pdf", "cards/wells-dvt.pdf", // printable Wells cards (the JSON is precached via index.json "scores")
  // the 22 block-schema score cards: printable cards (their JSON is precached via index.json "scores")
  "cards/alvarado.pdf", "cards/apgar.pdf", "cards/ipss.pdf", "cards/curb65.pdf", "cards/duke-ie.pdf", "cards/ottawa-ankle.pdf", "cards/pecarn.pdf", "cards/ugib.pdf",
  "cards/chest-pain.pdf", "cards/grace.pdf", "cards/csrs.pdf", "cards/caprini.pdf", "cards/framingham.pdf", "cards/renal.pdf", "cards/liver.pdf", "cards/lights.pdf",
  "cards/ganzoni.pdf", "cards/burns-adult.pdf", "cards/burns-paeds.pdf", "cards/phq9.pdf", "cards/sofa.pdf", "cards/copd-gold.pdf",
  // urine dipstick + adult / paediatric vitals: printable cards (their JSON is precached via index.json "scores")
  "cards/scorpion-grade.pdf", "cards/urine-dipstick.pdf", "cards/vitals-adult.pdf", "cards/vitals-paeds.pdf",
  // anthropometry cards (JSON precached via index.json "scores"; who_lms.json = WHO LMS tables, 436 KB, listed above)
  "cards/anthropometry-paeds-0-5.pdf", "cards/anthropometry-paeds-5-19.pdf", "cards/anthropometry-adult.pdf",
  // table + formula cards (tables.js)
  "cards/infusion-calculator.pdf", "cards/adrenaline-infusion-adult.pdf", "cards/adrenaline-infusion-paeds.pdf", "cards/phenytoin-loading.pdf", "cards/iron-anaemia-paeds.pdf", "cards/hunter-serotonin-toxicity.pdf", "cards/toxidromes.pdf",
  "data/tonsillitis-paeds.json", "data/croup-paeds.json", "data/om-paeds.json", "data/om-adult.json", "data/sinusitis-paeds.json", "data/sinusitis-adult.json",
  "data/uti-adult.json", "data/uti-paeds.json", "data/vds.json", "data/uds.json", "data/pid.json"];

self.addEventListener("install", e => e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL);
  const idx = await (await fetch("data/index.json", { cache: "no-store" })).json();
  await c.addAll(idx.diagnoses.map(d => "data/" + d.file));
  await c.addAll((idx.scores || []).map(d => "data/" + d.file)); // Scales and Calculations cards
  await c.addAll((idx.fluids || []).map(d => d.path)); // Fluids Rx cards (index "fluids", path = data/<id>.json)
  await c.addAll((idx.procedures || []).map(d => d.path)); // procedures: RSI, cardioversion, sedation, dislocations, electrolyte cards
  // Alternative Medicine (data/altmed/) is not installed for offline use: it is saved only once opened
  try { // formulary: one file per medicine
    const fx = await (await fetch("data/formulary/index.json", { cache: "no-store" })).json();
    await c.addAll(fx.drugs.map(d => "data/formulary/" + d.id + ".json"));
  } catch (err) { /* formulary is optional: the rest of the app still installs */ }
  self.skipWaiting();
})()));

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

// Only real, successful answers are saved: an error page, a "log in to Wi-Fi" or "out of data" page never replaces good data
const good = r => !!r && r.ok && r.type === "basic" && !/text\/html/i.test(r.headers.get("content-type") || "");
const save = async (req, r) => { if (good(r)) await (await caches.open(VERSION)).put(req, r.clone()); return r; };
const sleep = ms => new Promise(ok => setTimeout(() => ok(null), ms));
const offline = () => new Response(JSON.stringify({ error: "offline" }), { status: 504, headers: { "Content-Type": "application/json" } });

async function data(e) { // data/*.json: saved copy first, refreshed in the background
  const req = e.request, hit = await caches.match(req);
  const net = fetch(req, { cache: "no-store" }).then(r => save(req, r));
  e.waitUntil(net.catch(() => {})); // keep refreshing after the page already has its answer
  if (hit) return hit;
  const r = await Promise.race([net.catch(() => null), sleep(3000)]); // no saved copy: give the network 3 seconds
  if (good(r)) return r;
  // no answer in time, or a bad one: the app shows "Could not load"; if the fetch still finishes, the next open has it
  return (await caches.match(req)) || (r && !r.ok ? r : offline());
}
async function shell(e) { // app files: saved copy (installed with this version), network only for anything not saved
  const req = e.request, hit = await caches.match(req, { ignoreSearch: true }); if (hit) return hit;
  try { return await save(req, await fetch(req)); }
  catch { return (req.mode === "navigate" && (await caches.match("index.html"))) || Response.error(); } // opening the app offline always gets the start page
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes("/data/") ? data(e) : shell(e));
});
