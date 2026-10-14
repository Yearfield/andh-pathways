// Alternative Medicine — pathogen reference + feature filter (the "ILSE" search).
// Data: data/altmed/index.json (list, features, feature -> pathogen index), data/altmed/prose.json (text, loaded on first card).
// Built from altmed-src/*.csv by tools/build_altmed.py. Reference only; imported text is not guideline-checked.
// The module touches no DOM at import time, so rank() can be unit-tested in node (tests/altmed.test.mjs).

const A = {
  d: null, pf: null, prose: null, names: null,   // index, pathogen -> feature indices, prose blocks, A-Z order
  sel: {}, king: "All", strict: false, q: "", open: {}, shown: 80,   // Find: sel[featureIndex] = 1 (has) | -1 (must NOT have)
  bq: "", bk: "All", bshown: 120, last: "find", wired: false,
};
let X = null; // { app, esc, ico, loadJSON, $, $$ } supplied by app.js

/* ---------- pure logic ---------- */
// Rank pathogens for a set of selected features. sel: {featureIndex: 1|-1}. Returns { rows: [{pi, m: [matched has-features]}], has: [...], not: [...] } or null if nothing is selected.
export function rank(d, sel, { king = "All", strict = false } = {}) {
  const has = Object.keys(sel).filter(k => sel[k] === 1).map(Number), not = Object.keys(sel).filter(k => sel[k] === -1).map(Number);
  if (!has.length && !not.length) return null;
  const n = d.pathogens.length, cnt = new Uint16Array(n), out = new Uint8Array(n);
  has.forEach(f => (d.has[f] || []).forEach(pi => { cnt[pi]++; }));
  not.forEach(f => (d.has[f] || []).forEach(pi => { out[pi] = 1; }));
  const rows = [];
  for (let pi = 0; pi < n; pi++) {
    if (out[pi] || (king !== "All" && d.pathogens[pi][1] !== king)) continue;
    if (has.length ? (strict ? cnt[pi] !== has.length : !cnt[pi]) : false) continue;
    rows.push({ pi, c: cnt[pi] });
  }
  rows.sort((a, b) => b.c - a.c || d.pathogens[a.pi][0].localeCompare(d.pathogens[b.pi][0]));
  return { rows, has, not };
}
export const featuresOf = (d, pf, pi) => pf[pi] || [];
export function invert(d) { // pathogen index -> sorted feature indices
  const pf = new Array(d.pathogens.length);
  Object.keys(d.has).forEach(f => d.has[f].forEach(pi => (pf[pi] ||= []).push(+f)));
  pf.forEach(a => a && a.sort((x, y) => x - y));
  return pf;
}

/* ---------- loading ---------- */
async function load() {
  if (!A.d) {
    A.d = await X.loadJSON("data/altmed/index.json");
    A.pf = invert(A.d);
    A.names = A.d.pathogens.map((_, i) => i).sort((a, b) => A.d.pathogens[a][0].localeCompare(A.d.pathogens[b][0], undefined, { sensitivity: "base" }));
    A.kings = ["All", ...[...new Set(A.d.pathogens.map(p => p[1]))].sort((a, b) => a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b))];
  }
  return A.d;
}
async function loadProse() { if (!A.prose) A.prose = await X.loadJSON("data/altmed/prose.json"); return A.prose; }

/* ---------- small helpers ---------- */
const esc = s => X.esc(s);
const feat = i => A.d.features[i];
const STATUS = [["Imported — not verified", "imp"], ["Verified", "ver"], ["Disputed", "dis"]];
const SRCNAME = ["Formula sheet (strain level)", "Rosetta sheet (curated)", "Rosetta + Formula (merged species)"];
const LABEL = { disease: "Disease", symptom_a: "Presentation", symptoms: "Symptoms", incubation: "Incubation", transmission: "Transmission", host: "Host",
  commensal: "Commensal", importance: "Importance", risk_factors: "Risk factors", vaccine: "Vaccine", toxin: "Toxin", toxin_details: "Toxin details",
  aer_anaer: "Aerobic / anaerobic", stain: "Stain", size_um: "Size (µm)", ab_resistance: "Antibiotic resistance", diagnosis: "Diagnosis",
  treatment: "Treatment", prevention: "Prevention", bioweapon: "Bioweapon", fever: "Fever", rash: "Rash", cfs: "CFS", weightloss: "Weight loss" };
const NOTE_KEYS = ["notes", "notes_2", "notes_3"];
const dot = s => `<span class="adot s-${STATUS[s][1]}" aria-hidden="true"></span>`;
const picked = () => Object.keys(A.sel).length;

/* ---------- views ---------- */
function shell(title, sub, body, { search = "", tabs = "" } = {}) {
  X.app.innerHTML = `<header class="top"><div class="hometop">
    <div class="brand"><button class="iconbtn" aria-label="Back to start" data-go="#/">${X.ico("back")}</button>
      <div class="ttl"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div></div>${search}</div>${tabs}
    <div class="abanner">${X.ico("warn")}<span>Imported reference data — not SA STG, not clinically verified.</span></div></header>
  <main class="fade home alt">${body}</main>`;
}
const tabsHTML = on => `<nav class="ptabs atabs" aria-label="Alternative Medicine sections">${[["find", "Find"], ["browse", "Browse"], ["about", "About"]]
  .map(([k, l]) => `<button data-go="#/altmed/${k}" class="${on === k ? "on" : ""}" ${on === k ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav>`;
const kingChips = (attr, cur) => A.kings.map(k => `<button class="fchip" ${attr}="${esc(k)}" aria-pressed="${cur === k}">${esc(k)}</button>`).join("");

function chipHTML(i) {
  const v = A.sel[i], f = feat(i);
  return `<button class="achip ${v === 1 ? "has" : v === -1 ? "not" : ""}" data-al-f="${i}" aria-pressed="${!!v}" aria-label="${esc(f[1])}${v === 1 ? ", has" : v === -1 ? ", must not have" : ""}">${v === 1 ? "✓ " : v === -1 ? "⊘ " : ""}${esc(f[1])}</button>`;
}
function selHTML() {
  const ks = Object.keys(A.sel).map(Number).sort((a, b) => (A.sel[b] - A.sel[a]) || feat(a)[1].localeCompare(feat(b)[1]));
  return ks.length ? `<div class="achips">${ks.map(chipHTML).join("")}</div><button class="alink" data-al-clear>Clear all</button>`
    : `<p class="hint">Nothing selected yet. Tap a feature below: once for <b>has</b>, twice for <b>must NOT have</b>, three times to clear.</p>`;
}
function pickHTML() {
  const q = A.q.trim().toLowerCase(), d = A.d;
  if (q) {
    const ws = q.split(/\s+/), L = d.features.map((f, i) => i).filter(i => ws.every(w => (feat(i)[1] + " " + feat(i)[2]).toLowerCase().includes(w)));
    return L.length ? `<div class="achips">${L.slice(0, 80).map(chipHTML).join("")}</div>${L.length > 80 ? `<p class="hint">${L.length - 80} more — type more letters to narrow.</p>` : ""}`
      : `<p class="empty">No feature matches “${esc(A.q)}”.</p>`;
  }
  const g = {}; d.features.forEach((f, i) => (g[f[2]] ||= []).push(i));
  return Object.keys(g).sort((a, b) => a.localeCompare(b)).map(n => `<section class="agrp ${A.open[n] ? "open" : ""}">
    <button class="ahead" data-al-g="${esc(n)}" aria-expanded="${!!A.open[n]}"><span>${esc(n)} <small>${g[n].length}${g[n].some(i => A.sel[i]) ? " · " + g[n].filter(i => A.sel[i]).length + " picked" : ""}</small></span>${X.ico("down")}</button>
    ${A.open[n] ? `<div class="achips abody">${g[n].map(chipHTML).join("")}</div>` : ""}</section>`).join("");
}
function rowHTML(pi, extra = "", meta = "") {
  const p = A.d.pathogens[pi], nf = (A.pf[pi] || []).length;
  return `<button class="dx ax" data-go="#/altmed/p/${pi}"><span class="ab"><span class="t">${dot(p[5])}${esc(p[0])}</span>
    <span class="p">${esc(p[1])}${nf ? ` · ${nf} feature${nf === 1 ? "" : "s"}` : " · no features recorded"}${meta}</span></span>${extra}${X.ico("next")}</button>`;
}
function resHTML() {
  const r = rank(A.d, A.sel, { king: A.king, strict: A.strict });
  if (!r) return `<p class="empty">Pick one or more features to rank pathogens.</p>`;
  const shown = r.rows.slice(0, A.shown);
  return `<h2 class="glabel">${r.rows.length} match${r.rows.length === 1 ? "" : "es"}${r.has.length ? " · ranked by features matched" : ""}</h2>
  ${r.rows.length ? `<div class="list">${shown.map(({ pi, c }) => rowHTML(pi, r.has.length ? `<span class="asc ${c === r.has.length ? "all" : ""}">${c}/${r.has.length}</span>` : "",
    r.has.length ? `<br><span class="am">${r.has.map(f => (A.d.has[f] || []).includes(pi) ? `<b>${esc(feat(f)[1])}</b>` : `<s>${esc(feat(f)[1])}</s>`).join(" · ")}</span>` : "")).join("")}</div>
  ${r.rows.length > shown.length ? `<button class="btn" data-al-more>Show ${Math.min(80, r.rows.length - shown.length)} more</button>` : ""}`
    : `<p class="empty">No pathogen matches. Remove a feature, or untick “strict”.</p>`}`;
}
function paintFind() {
  $("#al-sel").innerHTML = selHTML(); $("#al-pick").innerHTML = pickHTML(); $("#al-res").innerHTML = resHTML();
  $("#al-kings").innerHTML = kingChips("data-al-k", A.king);
}
const $ = (s, el) => X.$(s, el);

function viewFind() {
  A.last = "find";
  shell("Alternative Medicine", `${A.d.counts.pathogens.toLocaleString("en")} pathogens · ${A.d.counts.features} features`, `
    <section><h2 class="glabel">Selected</h2><div id="al-sel"></div></section>
    <section><h2 class="glabel">Add features</h2><div id="al-pick"></div></section>
    <section><h2 class="glabel">Kingdom</h2><div class="achips" id="al-kings"></div>
      <label class="astrict"><input type="checkbox" id="alstrict" ${A.strict ? "checked" : ""}> Strict — must have every “has” feature</label></section>
    <section id="al-res"></section>`,
  { search: `<label class="search">${X.ico("search")}<span class="sr">Search features</span><input id="alq" type="search" placeholder="Search features — fever, rash, Brazil" autocomplete="off" value="${esc(A.q)}"></label>`, tabs: tabsHTML("find") });
  paintFind();
}
function viewBrowse() {
  A.last = "browse";
  shell("Alternative Medicine", "Browse A–Z", `<div class="achips" id="al-bk"></div><div id="al-bl"></div>`,
    { search: `<label class="search">${X.ico("search")}<span class="sr">Search names</span><input id="albq" type="search" placeholder="Search name — e.g. Salmonella, malaria" autocomplete="off" value="${esc(A.bq)}"></label>`, tabs: tabsHTML("browse") });
  paintBrowse();
}
function paintBrowse() {
  const ws = A.bq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const L = A.names.filter(i => (A.bk === "All" || A.d.pathogens[i][1] === A.bk) && ws.every(w => (A.d.pathogens[i][0] + " " + A.d.pathogens[i][6]).toLowerCase().includes(w)));
  const show = L.slice(0, A.bshown); let last = "", out = "";
  show.forEach(i => { const h = (A.d.pathogens[i][0][0] || "#").toUpperCase(); if (h !== last) { out += `${last ? "</div>" : ""}<h2 class="glabel">${esc(h)}</h2><div class="list">`; last = h; } out += rowHTML(i); });
  $("#al-bk").innerHTML = kingChips("data-al-bk", A.bk);
  $("#al-bl").innerHTML = L.length ? `<p class="hint">${L.length.toLocaleString("en")} entr${L.length === 1 ? "y" : "ies"} — includes entries with no recorded features.</p>${out}</div>
    ${L.length > show.length ? `<button class="btn" data-al-bmore>Show ${Math.min(120, L.length - show.length)} more</button>` : ""}` : `<p class="empty">No entry matches.</p>`;
}
function viewAbout() {
  const c = A.d.counts;
  shell("Alternative Medicine", "About this section", `
  <section class="akv acard"><div><b>Entries</b>${c.pathogens.toLocaleString("en")}</div><div><b>Features</b>${c.features}</div><div><b>Positive facts</b>${c.facts.toLocaleString("en")}</div></section>
  <section><h2 class="glabel">Review status</h2><div class="akv acard">
    <div>${dot(0)} <b class="inl">Imported</b> from the master sheet; not yet checked.</div><div>${dot(1)} <b class="inl">Verified</b> once checked against a source.</div><div>${dot(2)} <b class="inl">Disputed</b> when checked and found doubtful.</div></div></section>
  <section><h2 class="glabel">How “no” works</h2><p class="hint">Only positive facts are stored. A feature that is not listed for a pathogen is treated as <b>no</b>, so <i>must NOT have</i> can exclude an entry that is merely incomplete. Check the card before relying on a negative.</p></section>
  <section><h2 class="glabel">Sources</h2><p class="hint">Compiled over years from personal notes and experience (the Formula and Rosetta sheets). Not an academic or guideline source.</p></section>
  <section><h2 class="glabel">Offline</h2><p class="hint">The data is fetched the first time you open this section and kept on the phone afterwards; with no signal the saved copy is used.</p></section>`, { tabs: tabsHTML("about") });
}
async function viewCard(pi, tab) {
  const p = A.d.pathogens[pi]; if (!p) throw new Error("unknown entry " + pi);
  const prose = (await loadProse())[p[3]] || {}, fs = A.pf[pi] || [], strains = A.d.strains[pi] || [];
  const tabs = [["over", "Overview"], ["feat", `Features (${fs.length})`], ...(strains.length ? [["strains", `Strains (${strains.length})`]] : []), ["notes", "Notes"]];
  if (!tabs.some(t => t[0] === tab)) tab = "over";
  const kv = (l, v) => `<div><b>${esc(l)}</b>${esc(v)}</div>`;
  let body;
  if (tab === "over") {
    const rows = Object.keys(LABEL).filter(k => prose[k]).map(k => kv(LABEL[k], prose[k]) + (prose[k + "_formula"] ? kv(LABEL[k] + " — strain sheet", prose[k + "_formula"]) : ""));
    body = rows.length ? `<section class="akv acard">${rows.join("")}</section>` : `<p class="empty">No text recorded for this entry.</p>`;
  } else if (tab === "feat") {
    const g = {}; fs.forEach(i => (g[feat(i)[2]] ||= []).push(i));
    body = fs.length ? Object.keys(g).sort().map(n => `<section><h2 class="glabel">${esc(n)}</h2><div class="achips">${g[n].map(i => `<button class="achip" data-al-pick="${i}">${esc(feat(i)[1])}</button>`).join("")}</div></section>`).join("")
      + `<p class="hint">Tap a feature to find other pathogens that have it.</p>` : `<p class="empty">No features recorded for this entry.</p>`;
  } else if (tab === "strains") {
    body = `<section class="akv acard">${strains.map(s => kv(s[0], s[1] ? "NCBI " + s[1] : "")).join("")}</section>`;
  } else {
    const keys = NOTE_KEYS.filter(k => prose[k]), extra = Object.keys(prose).filter(k => /_formula$/.test(k) && /^notes/.test(k));
    body = keys.length || extra.length ? `<section class="akv acard">${keys.map(k => kv(k === "notes" && p[4] ? "Curated notes" : "Notes", prose[k])).join("")}${extra.map(k => kv("Notes — strain sheet", prose[k])).join("")}</section>`
      : `<p class="empty">No notes recorded.</p>`;
  }
  X.app.innerHTML = `<header class="top"><div class="hometop"><div class="brand"><button class="iconbtn" aria-label="Back" data-go="#/altmed/${A.last}">${X.ico("back")}</button>
    <div class="ttl"><h1 class="acn">${esc(p[0])}</h1><div class="sub">${esc(p[1])}${p[2] ? " · NCBI " + esc(p[2]) : ""}</div></div></div></div>
    <nav class="ptabs atabs" aria-label="Entry sections">${tabs.map(([k, l]) => `<button data-go="#/altmed/p/${pi}/${k}" class="${tab === k ? "on" : ""}" ${tab === k ? 'aria-current="page"' : ""}>${esc(l)}</button>`).join("")}</nav>
    <div class="abanner">${X.ico("warn")}<span>Imported reference data — not SA STG, not clinically verified.</span></div></header>
  <main class="fade home alt"><div class="amet"><span class="abadge s-${STATUS[p[5]][1]}">${dot(p[5])}${STATUS[p[5]][0]}</span><span class="hint">${esc(SRCNAME[p[4]])}</span></div>
    ${p[6] && p[6] !== p[0] ? `<p class="hint afull">${esc(p[6])}</p>` : ""}${body}</main>`;
  window.scrollTo(0, 0);
}

/* ---------- events ---------- */
function toggleFeat(i) { const v = A.sel[i]; if (!v) A.sel[i] = 1; else if (v === 1) A.sel[i] = -1; else delete A.sel[i]; A.shown = 80; paintFind(); }
function wire() {
  if (A.wired) return; A.wired = true;
  X.app.addEventListener("click", e => {
    const t = e.target.closest("[data-al-f],[data-al-g],[data-al-k],[data-al-bk],[data-al-more],[data-al-bmore],[data-al-pick],[data-al-clear]"); if (!t || !A.d) return;
    const D = t.dataset;
    if (D.alF !== undefined) return toggleFeat(+D.alF);
    if (D.alG !== undefined) { A.open[D.alG] = !A.open[D.alG]; return paintFind(); }
    if (D.alK !== undefined) { A.king = D.alK; A.shown = 80; return paintFind(); }
    if (D.alBk !== undefined) { A.bk = D.alBk; A.bshown = 120; return paintBrowse(); }
    if (D.alMore !== undefined) { A.shown += 80; return paintFind(); }
    if (D.alBmore !== undefined) { A.bshown += 120; return paintBrowse(); }
    if (D.alClear !== undefined) { A.sel = {}; return paintFind(); }
    if (D.alPick !== undefined) { A.sel[+D.alPick] = 1; A.q = ""; location.hash = "#/altmed/find"; }
  });
  X.app.addEventListener("input", e => {
    if (e.target.id === "alq") { A.q = e.target.value; A.shown = 80; $("#al-pick").innerHTML = pickHTML(); }
    if (e.target.id === "albq") { A.bq = e.target.value; A.bshown = 120; paintBrowse(); }
  });
  X.app.addEventListener("change", e => { if (e.target.id === "alstrict") { A.strict = e.target.checked; A.shown = 80; $("#al-res").innerHTML = resHTML(); } });
}

/* ---------- entry point (called from app.js route()) ---------- */
export async function altmed(parts, ctx) {
  X = ctx; wire(); await load();
  const [page, a, b] = parts;
  if (page === "p") return viewCard(+a, b);
  if (page === "browse") return viewBrowse();
  if (page === "about") return viewAbout();
  return viewFind();
}
