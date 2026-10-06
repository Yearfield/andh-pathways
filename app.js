// JAD Pathways — offline reference app. Data lives in data/*.json (one file per diagnosis).
import { REG, analyse, KPA_TO_MMHG, scoreCard, interpretCard, validateScoreCard } from "./calc.js"; // pure calculation registry
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("#app");
const LS_VER = "andh.verified", LS_OFF = "andh.offsets", LS_MODE = "andh.verifyMode", LS_CHK = "andh.checked", LS_REC = "andh.recent";
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const S = {
  index: null, sources: {}, dx: {}, verified: ls(LS_VER, {}), offsets: ls(LS_OFF, {}),
  verify: localStorage.getItem(LS_MODE) === "1", checked: ls(LS_CHK, {}), recent: ls(LS_REC, []),
  open: {}, chain: {}, seg: 0, filter: "All", sys: "All", cat: "All", dxo: {}, hub: {}, // dxo: open differential cards per pathway; hub: chosen member (0 = first) per hub id
  sd: {}, sc: null, spop: "All", stag: "All", // scales and calculations: loaded cards, live scorer state, list filters
};

/* ---------- icons (inline stroke SVG) ---------- */
const P = {
  back: '<path d="m15 6-6 6 6 6"/>', next: '<path d="m9 6 6 6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  arrival: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
  days: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  doses: '<path d="m10.5 20.5-7-7a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7zM7 10l7 7"/>',
  differentials: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12h10"/>',
  nursing: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  sources: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M19 19v2H6"/>',
  scale: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  interp: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  formulas: '<path d="M17 4H7l6 8-6 8h10"/>',
  analyse: '<path d="M4 20V10M10 20V4M16 20v-7"/><path d="M2 20h20"/>',
  ref: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M19 19v2H6"/>',
  scales: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
};
const ico = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

// Population strings carry extra detail ("Adult (excludes …)", "Paediatric 28 days – 12 years (…)"),
// but the badge/group is always one of these four canonical buckets — never the raw text.
// Classify on the text before the first "(" or ";" only — later clauses are exclusions
// (e.g. "Adult (excludes ... obstetric bleeding)", "...HIV-negative (HIV+ → TB-HIV pathway)")
// and must not leak into the bucket a pathway is filed under.
const popPrefix = p => String(p).split(/\s*[(;]/, 1)[0];
const popBucket = p => (p = popPrefix(p), /obstet/i.test(p) ? "obstetric" : (/adult/i.test(p) && /paed|child/i.test(p)) ? "tox" : /paed|child|neonat|infant/i.test(p) ? "paediatric" : "adult");
const popOf = e => e.tags?.pop || e.population; // explicit tag wins over guessing from the free-text population
const popClass = p => "pop-" + popBucket(p);
const popName = p => ({ obstetric: "Obstetric", tox: "Adult + paeds", paediatric: "Paediatric", adult: "Adult" }[popBucket(p)]);

/* ---------- storage for guideline PDFs (IndexedDB, stays on the phone) ---------- */
const db = new Promise((res, rej) => {
  const r = indexedDB.open("andh", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("pdfs");
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idb = async (mode, fn) => { const d = await db; return new Promise((res, rej) => {
  const tx = d.transaction("pdfs", mode); const q = fn(tx.objectStore("pdfs"));
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
const getPdf = id => idb("readonly", s => s.get(id));
const putPdf = (id, blob) => idb("readwrite", s => s.put(blob, id));
const delPdf = id => idb("readwrite", s => s.delete(id));

/* ---------- data ---------- */
async function loadJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }
async function init() {
  S.index = await loadJSON("data/index.json");
  { // every diagnosis must carry tags {pop, system[], cat[]} using the values the filter rows offer
    const bad = S.index.diagnoses.filter(e => !e.tags || !Array.isArray(e.tags.system) || !Array.isArray(e.tags.cat) || !["Paediatric", "Obstetric", "Adult", "Adult + paeds"].includes(e.tags.pop)
      || e.tags.system.some(s => !SYSTEMS.includes(s)) || e.tags.cat.some(c => !CATS.includes(c))).map(e => e.id);
    if (bad.length) console.warn("Diagnoses with missing/invalid tags:", bad.join(", "));
  }
  (await loadJSON("data/sources.json")).sources.forEach(s => (S.sources[s.id] = s));
  try { S.pm = await loadJSON("data/page-map.json"); } catch (e) { S.pm = null; console.warn("page-map.json not loaded; STG cites use per-chapter offsets only"); }
  window.addEventListener("hashchange", route); route();
}
/* A source cite is "id:page". Sources split into one PDF per chapter (s.chapters) cite "id:chapter.page";
   those resolve to a per-chapter PDF (stored under "id:chapter") with its own page offset. */
function resolveSrc(src) {
  let [id, pg = ""] = src.split(":"); let s = S.sources[id] || { id, short: id, title: id };
  if (s.alias && S.sources[s.alias]) { id = s.alias; s = S.sources[id]; } // e.g. HOSP -> stg-adult: share the chapter PDFs already loaded
  if (s.url_template && pg) // online source cited by topic id (e.g. ob:1011): no PDF, the cite links to the topic page
    return { id, s, pdf: id, chapter: null, pg, num: false, offset: 0, online: s.url_template.replace("{id}", encodeURIComponent(pg)), label: s.short + " " + (s.cite_prefix || "") + pg };
  const m = s.chapters && /^(\d+)\.(\d+)$/.exec(pg);
  if (m) { const ch = s.chapters[m[1]] || { title: "Chapter " + m[1] };
    const r = { id, s, pdf: id + ":" + m[1], chapter: m[1], pg: m[2], num: true, offset: S.offsets[id + ":" + m[1]] ?? ch.offset ?? 0, label: s.short + " Ch" + m[1] + " p" + m[2] };
    // chapter.page -> PDF page through data/page-map.json (built from the guideline catalogue): the chapter's own document + offset,
    // because one offset per book cannot resolve STG cites. r.pdf stays the older per-chapter key, used as a fallback.
    const pm = S.pm?.books?.[id]?.[m[1]];
    if (pm) { const dk = "doc:" + pm[0]; r.doc = dk; r.mapped = +m[2] + pm[1] + (S.offsets[dk] ?? 0); }
    return r; }
  const num = /^\d/.test(pg);
  return { id, s, pdf: id, chapter: null, pg, num, offset: S.offsets[id] ?? s.offset ?? 0, label: s.short + " " + (num ? "p" : "") + pg };
}
const entry = id => S.index.diagnoses.find(d => d.id === id);
async function getDx(id) {
  if (!S.dx[id]) { const e = entry(id); if (!e) throw new Error("unknown pathway " + id); S.dx[id] = await loadJSON("data/" + e.file); }
  return S.dx[id];
}

/* ---------- verification (key changes if the text or source changes -> item becomes unverified again) ---------- */
const key = (dx, it) => { let h = 5381, s = dx + "|" + (it.t || it.h) + "|" + (it.s || ""); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function allItems(d) {
  const out = []; const add = a => (a || []).forEach(i => i.t && out.push(i));
  d.admission.forEach(s => add(s.items)); add(d.decision); add(d.chart.standing);
  d.chart.rows.forEach(r => { add(r.feed); add(r.tests); add(r.treatment); if (r.lead) out.push({ t: r.lead }); });
  (d.differentials || []).forEach(x => { add(x.features); add(x.confirm); add(x.manage); add(x.refer); });
  d.boxes.forEach(b => add(b.items)); add(d.discharge.items); add(d.followup.items);
  d.nursing.params.forEach(p => add(p.items)); add(d.nursing.call); return out;
}
const progress = d => { const a = allItems(d); const v = a.filter(i => S.verified[key(d.id, i)]).length; return [v, a.length]; };
const doneCount = (d, items) => { const r = (items || []).filter(i => i.t); return [r.filter(i => S.checked[key(d.id, i)]).length, r.length]; };

/* ---------- item rendering ---------- */
const chipx = it => chip(it.s) + (it.s_more || []).map(chip).join(""); // an item's own cite plus any s_more extra cites
function chip(src) {
  if (!src) return "";
  const r = resolveSrc(src); // numeric = printed page; otherwise a recommendation number (e.g. ESGE R13)
  if (r.online) return `<a class="chip" href="${esc(r.online)}" target="_blank" rel="noopener" aria-label="Open ${esc(r.label)} online">${esc(r.label)} ↗</a>`;
  return `<button class="chip" data-src="${esc(src)}" aria-label="Open ${esc(r.label)}">${esc(r.label)}</button>`;
}
const dag = it => it.d ? '<span class="dag">†</span>' : "";
const tick = (k) => { const v = S.verified[k]; return S.verify ? `<button class="tick ${v ? "on" : ""}" data-tick="${k}" aria-pressed="${!!v}" aria-label="${v ? "Verified " + v : "Mark verified"}">✓</button>` : ""; };
function li(d, it) {
  if (it.k === "handoff") { // jump to another pathway (#/dx/…) or procedure card (#/proc/…) named in "to"
    const to = it.to, href = (S.index.diagnoses || []).some(x => x.id === to) ? `#/dx/${to}/arrival` : [...(S.index.procedures || []), ...(S.index.fluids || [])].some(x => x.id === to) ? `#/proc/${to}/procedure` : "";
    return `<li class="handoff ${it.b ? "b" : ""}"><div class="body">${href ? `<button class="ho" data-go="${esc(href)}"><span class="arr" aria-hidden="true">➜</span><span class="txt">${esc(it.t)}${dag(it)}</span></button>` : `<span class="txt">${esc(it.t)}${dag(it)}</span>`}${chipx(it)}</div>${tick(key(d.id, it))}</li>`;
  }
  if (it.h && !it.t) return `<li class="head"><span class="txt" style="flex:1">${esc(it.h)}${dag(it)}</span>${chipx(it)}</li>`;
  const k = key(d.id, it); const cOn = S.checked[k];
  const cls = [it.k === "sub" ? "sub" : "", it.k === "info" ? "info" : "", it.k === "value" ? "value" : "", it.b ? "b" : "", it.k === "yn" ? "yn" : "", cOn ? "checked" : ""].join(" ");
  const chk = `<button class="chk ${cOn ? "on" : ""}" data-chk="${k}" aria-pressed="${!!cOn}" aria-label="${cOn ? "Checked off" : "Mark done"}"></button>`;
  return `<li class="${cls}">${chk}<div class="body"><span class="txt">${esc(it.t)}${dag(it)}</span>${chipx(it)}</div>${tick(k)}</li>`;
}
const list = (d, items) => `<ul class="items">${(items || []).map(i => li(d, i)).join("")}</ul>`;
const card = (d, title, items, cls = "") => `<section class="card ${cls}"><h2 class="ctitle">${esc(title)}</h2>${list(d, items)}</section>`;

/* ---------- screens ---------- */
function shell({ d, tab, body, head = "", after = "", mainCls = "" }) {
  const [v, n] = d ? progress(d) : [0, 0];
  const e = d ? entry(d.id) || d : null;
  const hub = e.hub && (S.index.hubs || []).find(h => h.id === e.hub);
  app.innerHTML = `
  <header class="top"><div class="bar">
    <button class="iconbtn" aria-label="${hub ? "Back to " + esc(hub.short) : "Back to all pathways"}" data-go="${hub ? "#/hub/" + hub.id : "#/diagnoses"}">${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(e.short || d.title)}</h1><span class="badge ${popClass(popOf(e) || d.population)}">${esc(popName(popOf(e) || d.population))}</span></div>
      <div class="sub">${esc(d.title)}</div></div>
    <button class="iconbtn" id="more" aria-label="More: verify mode, reset checklist" aria-haspopup="true">${MORE}</button></div>
    ${S.verify ? `<div class="meter" title="${v} of ${n} verified"><i style="width:${n ? (100 * v / n) : 0}%"></i></div>` : ""}
    ${head}</header>
  <main class="fade ${mainCls}">${body}</main>${after}
  <nav class="tabs">${[["arrival", "Arrival"], ["days", "Timeline"], ["differentials", "Differentials"], ["doses", "Doses"], ["nursing", "Nursing"], ["sources", "Sources"]]
      .filter(([t]) => t !== "differentials" || (d.differentials || []).length).map(([t, l]) => `<button data-go="#/dx/${d.id}/${t}" class="${tab === t ? "on" : ""}" ${tab === t ? 'aria-current="page"' : ""}>${ico(t)}${l}</button>`).join("")}</nav>`;
}

/* ---------- start page + procedures ---------- */
function landing() {
  const nd = listRows().length, np = (S.index.procedures || []).length, ns = (S.index.scores || []).filter(e => !e.hidden).length + (S.index.fluids || []).length;
  app.innerHTML = `
  <header class="top"><div class="hometop"><div class="brand"><img class="logo" src="icons/jad-logo.webp" alt="JAD">
    <div class="ttl"><h1>Pathways</h1><div class="sub">ANDH · works offline</div></div>
    ${navigator.serviceWorker?.controller ? `<span class="pill-ok">${ico("check")}Saved</span>` : ""}</div></div></header>
  <main class="fade home"><div class="tiles">
    <button class="tile" data-go="#/diagnoses">${ico("arrival")}<b>Diagnoses Pathways</b><span>Admission, timeline, doses and nursing · ${nd} pathways</span></button>
    <button class="tile" data-go="#/procedures">${ico("doses")}<b>Procedures Pathways</b><span>Step-by-step emergency procedures · ${np} procedure${np === 1 ? "" : "s"}</span></button>
    <button class="tile" data-go="#/scores">${ico("scales")}<b>Scales and Calculations</b><span>Scores, grades and calculators · ${ns} card${ns === 1 ? "" : "s"}</span></button></div>
    <p class="hint">Reference only — no patient details are stored.</p></main>`;
}
function procHome() {
  const ps = S.index.procedures || [];
  app.innerHTML = `
  <header class="top"><div class="hometop"><div class="brand"><button class="iconbtn" aria-label="Back to start" data-go="#/">${ico("back")}</button>
    <div class="ttl"><h1>Procedures pathways</h1><div class="sub">ANDH · ${ps.length} procedure${ps.length === 1 ? "" : "s"} · works offline</div></div></div></div></header>
  <main class="fade home"><section class="grp"><div class="list">${ps.map(e => `<button class="dx" data-go="#/proc/${e.id}">
    <span class="t">${esc(e.short || e.title)}</span><span class="p">${esc(e.title)} · ${esc(e.population)} · ${esc(e.setting)}</span>${ico("next")}</button>`).join("")}</div></section>
    <p class="hint">† = clinical or local addition, not in the SA guideline.</p></main>`;
}
/* ---- exact doses from the dose-table "basis" text, e.g. "0.02 mg/kg, min 0.1, max 0.5" or "2 mcg/kg (1 if shocked)" ---- */
const fmtD = n => String(parseFloat((+n).toFixed(2)));
function parseBasis(b) {
  const m = /^([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*(mcg|mg)\/kg(?:\s*\(([\d.]+)\s+if\s+(\w+)\))?(?:,\s*min\s+([\d.]+))?(?:,\s*max\s+([\d.]+))?/i.exec(b || "");
  return m ? { lo: +m[1], hi: m[2] ? +m[2] : +m[1], unit: m[3], alt: m[4] ? +m[4] : null, altWhen: m[5], min: m[6] ? +m[6] : null, max: m[7] ? +m[7] : null } : null;
}
function concOf(R, row) { // mg or mcg per mL, from the matching drug card's "conc" text (e.g. "50 mcg/mL", "… = 1 mg/mL")
  const x = (R.drugs || []).find(q => q.m === row.m && q.name.toLowerCase().startsWith(row.drug.toLowerCase())) || (R.drugs || []).find(q => q.name.toLowerCase().startsWith(row.drug.toLowerCase()));
  const m = x && /([\d.]+)\s*(mg|mcg)\/mL\s*(?:\(|$|;)|=\s*([\d.]+)\s*(mg|mcg)\/mL/.exec(x.conc || ""); if (!m) return null;
  return { per: +(m[1] || m[3]), unit: m[2] || m[4] };
}
function doseFor(R, row, kg) {
  const b = parseBasis(row.basis); if (!b) return null;
  const lim = v => { if (b.min != null) v = Math.max(v, b.min); if (b.max != null) v = Math.min(v, b.max); return v; };
  const c = concOf(R, row), ml = v => c && c.unit === b.unit ? ` · ${fmtD(v / c.per)} mL` : "";
  const lo = lim(b.lo * kg), hi = lim(b.hi * kg), range = lo === hi ? fmtD(lo) : `${fmtD(lo)}–${fmtD(hi)}`;
  const mlTxt = lo === hi ? ml(lo) : c && c.unit === b.unit ? ` · ${fmtD(lo / c.per)}–${fmtD(hi / c.per)} mL` : "";
  const alt = b.alt != null ? { v: lim(b.alt * kg), when: b.altWhen } : null;
  return { main: `${range} ${b.unit}${mlTxt}`, alt: alt ? `${fmtD(alt.v)} ${b.unit}${ml(alt.v)} if ${alt.when}` : "", capped: (b.max != null && b.hi * kg > b.max) || (b.min != null && b.lo * kg < b.min) };
}
const numeralTxt = m => esc(String(m).replace(/\s+(?!\s*alt)/g, " · "));
function weightCalc(R, kg) {
  if (!(kg > 0)) return `<p class="hint">Type the weight to see exact doses for every drug.</p>`;
  const rows = R.dose_table.rows.map(r => { const x = doseFor(R, r, kg);
    return `<div class="wrow"><div class="wd"><span class="mk">${numeralTxt(r.m)}</span>${esc(r.drug)}</div><div class="wv">${x ? `<b>${esc(x.main)}</b>${x.alt ? `<span class="walt">${esc(x.alt)}</span>` : ""}${x.capped ? '<span class="walt">dose limit applied</span>' : ""}` : `<span class="walt">see table: ${esc(r.basis)}</span>`}</div></div>`; }).join("");
  return `<div class="wlist" aria-live="polite">${rows}</div><p class="hint">Calculated from the basis shown on each table row (${R.dose_table.rows.length} drugs) for ${fmtD(kg)} kg; always check the dose against the STG before giving.</p>`;
}
async function procView(id, tab) {
  const fe = (S.index.fluids || []).find(x => x.id === id), e = fe || (S.index.procedures || []).find(x => x.id === id); if (!e) throw new Error("unknown procedure " + id);
  const isFl = !!fe; // Fluids Rx cards (Scales and Calculations) use this renderer with their own tabs: Steps / Reference / Sources
  if (isFl && fe.pop !== "Adult + paeds") S.hub.fluids = (S.index.fluids_hub?.members || []).findIndex(m => m.pop === fe.pop) || 0; // the hub reopens on the population you were in
  const tm = s => s.time ?? s.timing ?? ""; // steps carry both "timing" and "time"
  const d = S.dx[id] ||= await loadJSON(e.path);
  const R = d.reference || {}, dg = x => x.d ? '<span class="dag">†</span>' : "";
  const secs = (arr, cls = "") => (arr || []).map(s => card(d, s.h, s.items, cls)).join("");
  const chips = x => x.m ? `<span class="mk">${esc(x.m)}</span>` : "";
  const act = a => { const k = key(d.id, { t: a.t, s: a.s }), on = S.checked[k];
    return `<li class="act ${a.b ? "b" : ""} ${on ? "checked" : ""}"><button class="chk ${on ? "on" : ""}" data-chk="${k}" aria-pressed="${!!on}" aria-label="${on ? "Done" : "Mark done"}"></button>
      <div class="body"><div class="at"><span class="an">${esc(a.n)}</span><span class="txt">${esc(a.t)}${dg(a)}</span></div>${a.x ? `<div class="ax">${esc(a.x)}</div>` : ""}${chipx(a)}</div></li>`; };
  const dec = x => { const flow = x.then.split(" → "), red = /fail/i.test(x.if);
    return `<div class="dec ${red ? "red" : ""}"><div class="if"><b>IF</b> ${esc(x.if)}${dg(x)}</div>
      <div class="then"><b>THEN</b>${flow.length > 1 ? `<ol class="plans">${flow.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ` ${esc(x.then)}`}${chipx(x)}</div></div>`; };
  const numeral = m => esc(String(m).replace(/\s+(?!\s*alt)/g, " · "));
  const cell = q => `<li><span class="mk big">${esc(q.m)}</span><div class="sb"><div class="sn">${esc(q.drug)}${dg(q)}</div>
    <div class="sw">${esc(q.when)}</div><div class="sd">${esc(q.dose)}</div><div class="sa">${esc(q.adjusted)}</div>${chip(q.s)}</div></li>`;
  // steps[].sequences = parallel chains (each cells[] in a → b → c order); falls back to the single steps[].sequence
  const seqHtml = s => {
    const chains = s.sequences?.length ? s.sequences : [{ id: "", label: "", cells: s.sequence || [] }];
    const multi = chains.length > 1, sel = Math.min(S.chain[id] ?? 0, chains.length - 1);
    return `${s.pre ? `<div class="chainpre"><div class="cl">Before the chains</div><ol class="seq">${cell(s.pre)}</ol></div>` : ""}
    ${multi ? `<nav class="chaintabs" aria-label="Regimens">${chains.map((c, k) => `<button data-chain="${k}" class="${k === sel ? "on" : ""}" aria-pressed="${k === sel}"><b>${esc(c.id)}</b>${esc(c.label)}</button>`).join("")}</nav>` : ""}
    <div class="chains ${multi ? "multi" : ""}">${chains.map((c, k) => `<div class="chain ${k === sel ? "on" : ""}" data-chainbox="${k}">
      ${multi ? `<div class="chead"><span class="cnum">${esc(c.id)}</span><div><b>${esc(c.label)}</b>${c.note ? `<span>${esc(c.note)}</span>` : ""}</div></div>` : ""}
      <ol class="seq">${(c.cells || []).map(cell).join("")}</ol></div>`).join("")}</div>
    <div class="toolrow"><button class="btn" data-go="#/proc/${id}/drugs">Dose table by weight${ico("next")}</button></div>`; };
  const flowNav = `<nav class="flownav" aria-label="Steps">${d.steps.map(s => `<button data-jump="p${s.n}"><b>${s.n}</b><span>${esc(tm(s))}</span></button>`).join("")}</nav>`;
  // steps[].sequence as ROWS ({label, sub, cells[{m, name, dose, note, s, s_more}]}) plus sequence_order: Fluids Rx cards. The older format
  // (sequence = flat cells, or sequences = parallel chains) keeps its own renderer above.
  const fcell = q => `<li><span class="mk big">${esc(q.m || "")}</span><div class="sb"><div class="sn">${esc(q.name)}${dg(q)}</div>${q.dose ? `<div class="sd">${esc(q.dose)}</div>` : ""}${q.note ? `<div class="sa">${esc(q.note)}</div>` : ""}${chipx(q)}</div></li>`;
  const seqRows = s => `${s.sequence_order ? `<div class="seqord">${esc(s.sequence_order)}</div>` : ""}<div class="srows">${s.sequence.map(r =>
    `<div class="srow2"><div class="srl"><b>${esc(r.label)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ""}</div><ol class="seq">${(r.cells || []).map(fcell).join("")}</ol></div>`).join("")}</div>`;
  const seqAny = s => s.sequences?.length ? seqHtml(s) : s.sequence?.[0]?.cells ? seqRows(s) : (s.sequence || []).length ? seqHtml(s) : "";
  const refBlock = b => `<section class="card"><h2 class="ctitle">${esc(b.h)}${chipx(b)}</h2>` + (b.cols
    ? `<div class="tscroll"><table class="dtab"><thead><tr>${b.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, k) => k ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<ul class="items">${(b.items || []).map(it => `<li><div class="body"><span class="txt">${esc(it.t)}${dg(it)}</span>${chipx(it)}</div></li>`).join("")}</ul>`) +
    `${b.note ? `<p class="hint" style="padding:6px 14px 12px">${esc(b.note)}</p>` : ""}</section>`;
  const steps = flowNav + d.steps.map((s, i) => `<section class="pstep" id="p${s.n}"><div class="rail"><span class="node">${s.n}</span></div>
    <div class="pbody"><div class="phead"><h2>${esc(s.title)}</h2><span class="tpill">${esc(tm(s))}</span></div><div class="psub">${esc(s.subtitle)}</div>
      ${(s.actions || []).length ? `<ul class="items acts">${s.actions.map(act).join("")}</ul>` : ""}${seqAny(s)}
      ${(s.decisions || []).map(dec).join("")}</div></section>`).join("");
  const drug = x => `<section class="card drug"><h2 class="ctitle"><span class="mk">${numeral(x.m)}</span>${esc(x.name)}${dg(x)}</h2><dl class="dl">
    ${[["Conc.", x.conc], ["Dose", x.dose, 1], ["Give", x.when], ["Onset / duration", x.onset], ["Shocked / frail", x.adjusted], ["Watch", x.watch]].filter(r => r[1] && r[1] !== "—")
      .map(([l, v, b]) => `<div><dt>${l}</dt><dd class="${b ? "b" : ""}">${esc(v)}</dd></div>`).join("")}</dl>${x.s ? `<div class="drugsrc">${chip(x.s)}</div>` : ""}</section>`;
  S.procR = R;
  const calc = R.dose_table ? `<section class="card calc"><h2 class="ctitle">Exact doses for this patient</h2><div class="wpad"><label class="wlabel" for="wt">Weight</label>
    <span class="winp"><input id="wt" type="number" inputmode="decimal" min="0.5" max="250" step="any" placeholder="e.g. 70" value="${esc(S.procKg ?? "")}" autocomplete="off"><em>kg</em></span></div>
    <div id="wout">${weightCalc(R, parseFloat(S.procKg))}</div></section>` : "";
  const dt = R.dose_table, table = dt ? `<section class="card"><h2 class="ctitle">Dose by weight (${esc(dt.unit)})</h2><div class="tscroll"><table class="dtab">
    <thead><tr><th>Drug</th>${dt.weights.map(w => `<th>${w}</th>`).join("")}</tr>${dt.ages_approx ? `<tr class="ages"><th>Approx. age</th>${dt.ages_approx.map(a => `<th>${esc(a)}</th>`).join("")}</tr>` : ""}</thead><tbody>${dt.rows.map(r =>
    `<tr><th><span class="mk">${numeral(r.m)}</span>${esc(r.drug)}${dg(r)}<small>${esc(r.basis)} · ${esc(r.unit)}</small>${chip(r.s)}</th>${r.vals.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${dt.ages_note ? `<p class="hint" style="padding:0 14px 12px">${esc(dt.ages_note)}</p>` : ""}</section>` : "";
  const tabs = isFl ? [["indications", "Indications"], ["contraindications", "Cautions"], ["procedure", "Steps"], ["reference", "Reference"], ["sources", "Sources"]]
    : [["indications", "Indications"], ["contraindications", "Contra-indications"], ["procedure", "Procedure"], ["drugs", "Drugs"], ["after", "After & problems"]];
  tab = tabs.some(x => x[0] === tab) ? tab : "procedure";
  const body = { indications: `<h2 class="glabel">Indications</h2>${secs(d.indications)}`,
    contraindications: `<h2 class="glabel">${isFl ? "Cautions" : "Contraindications"}</h2>${secs(d.contraindications)}`,
    procedure: steps,
    drugs: `<h2 class="glabel">Drugs in order of giving</h2>${calc}${(R.drugs || []).map(drug).join("")}${table}`,
    after: d.complications ? `<h2 class="glabel">Sedation, ventilation and deterioration</h2>${secs(R.later)}<h2 class="glabel">${esc(d.complications.title)}</h2>${secs(d.complications.sections, "red")}` : "",
    reference: `<h2 class="glabel">${esc(R.title || "Reference")}</h2>${(R.blocks || []).map(refBlock).join("")}`,
    sources: tab === "sources" ? `<section class="card"><h2 class="ctitle">Sources</h2><ul class="items">${(d.sources || []).map(i => `<li><div class="body"><span class="txt"><b>${esc(S.sources[i]?.short || i)}</b> — ${esc(S.sources[i]?.title || i)}</span></div></li>`).join("")}</ul></section>${await scPdfRows(d)}` : "" }[tab];
  app.innerHTML = `
  <header class="top"><div class="bar"><button class="iconbtn" aria-label="${isFl ? "Back to Fluids Rx" : "Back to procedures"}" data-go="${isFl ? "#/fluids" : "#/procedures"}">${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(d.short)}</h1><span class="badge ${popClass(isFl ? e.pop : d.population)}">${esc(popName(isFl ? e.pop : d.population))}</span></div>
      <div class="sub">${esc(d.title)} · ${esc(d.setting)}</div></div></div>
    <nav class="ptabs" aria-label="Sections">${tabs.map(([k, l]) => `<button data-go="#/proc/${id}/${k}" ${k === tab ? 'class="on" aria-current="page"' : ""}>${l}</button>`).join("")}</nav></header>
  <main class="fade proc">${body}
    <p class="hint footnote">${esc(d.regimen)} · ${esc(d.hospital)} · updated ${esc(d.updated)}. ${esc(d.dagger_note)}</p></main>`;
}

/* In the diagnosis list the group heading already says Adult or Paediatric, so the same word is dropped from each row's name and
   description ("TB (child)" under Paediatric -> "TB"). Display only: the data, the pathway header badge and Recent cards keep full names. */
const unpop = t => String(t)
  .replace(/\s*\((?:adult|child|paeds|paediatric)\)/gi, "")                 // "(adult)" / "(child)"
  .replace(/\(child\s*([<≥][^)]*)\)/gi, "($1)")                             // "(child < 2 years)" -> "(< 2 years)"
  .replace(/\s*[—–]\s*(?:adult|child|paediatric|paeds|neonate)(?=\s*(?:\(|$))/gi, "") // "— adult", "— child (post-arrest …)", "— neonate"
  .replace(/,\s*(?:adult|child|paediatric|paeds)\s*$/i, "")                 // "…(croup), child"
  .replace(/admitted\s+adult\b/gi, "admitted")                               // "— admitted adult"
  .replace(/admitted\s+child\s+/gi, "admitted, ")                            // "— admitted child 28 days to < 15 years"
  .replace(/\s{2,}/g, " ").replace(/\s*[—–]\s*$/, "").trim();

/* Diagnosis list rows. Members of a hub (index.json "hubs", e.g. Fracture adult + paeds) collapse into ONE row that opens the hub page. */
function listRows() {
  const hubs = S.index.hubs || [];
  return [...S.index.diagnoses.filter(e => !e.hub).map(e => ({ e })),
    ...hubs.map(h => ({ e: { ...h, population: h.population || "Adult + Paediatric" }, hub: h }))];
}
function home() {
  const rows = listRows();
  const groups = [...new Set(rows.map(r => popName(popOf(r.e))))];
  const rec = S.recent.map(r => ({ ...r, e: entry(r.id) })).filter(r => r.e).slice(0, 3);
  const tabName = { arrival: "Arrival", days: "Timeline", differentials: "Differentials", doses: "Doses", nursing: "Nursing", sources: "Sources" };
  const recent = rec.length ? `<section id="recent"><h2 class="glabel">Recent</h2><div class="recent">${rec.map(r =>
    `<button class="rcard" data-go="#/dx/${r.id}/${r.tab}${r.tab === "days" && r.row ? "/" + r.row : ""}"><b>${esc(r.e.short)}</b><span>${esc(tabName[r.tab] || "")}</span></button>`).join("")}</div></section>` : "";
  const rowHtml = ({ e, hub }) => {
    // a hub row is listed once (under Adult + paeds) but must still show when the population filter is Adult or Paediatric
    const pops = hub ? [...hub.members.map(m => m.label), popName(popOf(e))] : [popName(popOf(e))];
    const trim = !hub && /^(Adult|Paediatric)$/.test(pops[0]) ? unpop : t => t;
    return `<button class="dx" data-go="${hub ? "#/hub/" + e.id : `#/dx/${e.id}/arrival`}" ${hub ? `data-hub="${esc(e.id)}"` : ""} data-q="${esc((e.short + " " + e.title + " " + popPrefix(e.population) + " " + popName(popOf(e)) + " " + e.id).toLowerCase())}" data-pops="${esc(pops.join("|"))}" data-sys="${esc((e.tags?.system || []).join("|"))}" data-cat="${esc((e.tags?.cat || []).join("|"))}">
        <span class="t">${esc(trim(e.short))}</span><span class="p">${trim(e.title).toLowerCase() === trim(e.short).toLowerCase() ? "" : esc(trim(e.title))}</span>${ico("next")}</button>`; // a description that only repeats the name is left blank
  };
  const lists = groups.map(g => { const items = rows.filter(r => popName(popOf(r.e)) === g);
    return `<section class="grp" data-grp="${esc(g)}"><h2 class="glabel"><span class="dot ${popClass(popOf(items[0].e))}"></span>${esc(g)}<span class="c">· <span class="gc">${items.length}</span></span></h2>
      <div class="list">${items.map(rowHtml).join("")}</div></section>`; }).join("");
  app.innerHTML = `
  <header class="top"><div class="hometop">
    <div class="brand"><button class="iconbtn" aria-label="Back to start" data-go="#/">${ico("back")}</button>
      <div class="ttl"><h1>Diagnosis pathways</h1><div class="sub">ANDH · ${rows.length} pathways · works offline</div></div>
      ${navigator.serviceWorker?.controller ? `<span class="pill-ok">${ico("check")}Saved</span>` : ""}</div>
    <label class="search">${ico("search")}<span class="sr">Search pathways</span>
      <input id="q" type="search" placeholder="Search — e.g. PPH, DKA, rat poison" autocomplete="off"></label>
    <div class="chips">${["All", ...groups].map(g => `<button class="fchip" data-filter="${esc(g)}" aria-pressed="${S.filter === g}">${esc(g)}</button>`).join("")}</div>
    <div class="chips sys" aria-label="Body system">${SYSTEMS.map(g => `<button class="fchip sysc ${g !== "All" && !rows.some(r => (r.e.tags?.system || []).includes(g)) ? "none" : ""}" data-sysfilter="${g}" aria-pressed="${S.sys === g}">${g}</button>`).join("")}</div>
    <div class="chips sys" aria-label="Category">${CATS.map(g => `<button class="fchip catc ${g !== "All" && !rows.some(r => (r.e.tags?.cat || []).includes(g)) ? "none" : ""}" data-catfilter="${g}" aria-pressed="${S.cat === g}">${g}</button>`).join("")}</div>
  </div></header>
  <main class="fade home">${recent}${lists}<p class="empty" id="none" hidden>No pathway matches.</p>
    <p class="hint">Reference only — no patient details are stored. Amber tags open the guideline page they come from. † = clinical or local addition, not in the SA guideline.</p></main>`;
  applyFilter();
  // let a search such as "clavicle" find the Fracture row: add each hub's site names to its search text once the member files are loaded
  (S.index.hubs || []).forEach(async h => { try {
    const ds = await Promise.all(h.members.map(m => getDx(m.id))); const b = $(`.dx[data-hub="${h.id}"]`); if (!b) return;
    b.dataset.q += " " + ds.flatMap(d => (d.differentials || []).map(x => x.dx + " " + (x.group || ""))).join(" ").toLowerCase(); applyFilter();
  } catch {} });
}
const CATS = ["All", "Endo", "Toxins", "Infections"];
const SYSTEMS = ["All", "Resp", "CVS", "ABDO", "GIT", "CNS", "ENT", "Ortho", "Gynae", "Uro", "Nephro"];
function applyFilter() {
  const q = ($("#q")?.value || "").trim().toLowerCase(); let any = 0;
  $$(".grp").forEach(g => {
    let n = 0;
    $$(".dx", g).forEach(b => { const ok = (S.filter === "All" || b.dataset.pops.split("|").includes(S.filter)) && (S.sys === "All" || b.dataset.sys.split("|").includes(S.sys)) && (S.cat === "All" || b.dataset.cat.split("|").includes(S.cat)) && (!q || q.split(/\s+/).every(w => b.dataset.q.includes(w))); b.hidden = !ok; if (ok) n++; });
    g.hidden = !n; $(".gc", g).textContent = n; any += n;
  });
  const r = $("#recent"); if (r) r.hidden = !!q || S.filter !== "All" || S.sys !== "All" || S.cat !== "All";
  $("#none").hidden = !!any;
  $$(".fchip[data-filter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === S.filter));
  $$(".fchip[data-sysfilter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sysfilter === S.sys));
  $$(".fchip[data-catfilter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.catfilter === S.cat));
}

const secLabel = (s) => s.n === 0 ? "Not this" : s.n === 1 ? "Diagnose" : s.n === 2 ? "Refer if" : /red flag/i.test(s.title) ? "Red flags"
  : s.title.split(/ — | = | \(|:|,| · /)[0].split(" ").slice(0, 2).join(" ");
const isRed = s => s.n === 0 || s.n === 2 || /red flag/i.test(s.title);

function arrival(d) {
  const open = S.open[d.id] ||= new Set([0, 1, 2]); // 0 = exclusion box, open by default
  const secs = d.admission.map(s => { const [c, n] = doneCount(d, s.items); return { s, c, n }; });
  const last = Math.max(...d.admission.map(s => s.n));
  const jump = `<nav class="jump" aria-label="Sections">${secs.map(({ s, c, n }) =>
    `<button data-jump="s${s.n}" class="${isRed(s) ? "red" : ""} ${n && c === n ? "done" : ""}"><b>${s.n}</b>${esc(secLabel(s))}</button>`).join("")}
    <button data-jump="dec"><b>${last + 1}–${last + d.decision.length}</b>Decide</button></nav>`;
  const body = secs.map(({ s, c, n }) => `<section class="card ${isRed(s) ? "red" : ""} ${open.has(s.n) ? "" : "closed"}" id="s${s.n}">
      <h2><button class="shead" data-sec="${s.n}" aria-expanded="${open.has(s.n)}"><span class="n">${s.n}</span><span class="st">${esc(s.title)}</span>
        <span class="cnt ${n && c === n ? "all" : ""}">${c}/${n}</span>${ico("down")}</button></h2>
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ""}${list(d, s.items)}</section>`).join("") +
    `<div id="dec" style="display:flex;flex-direction:column;gap:8px;scroll-margin-top:90px">${d.decision.map((x, i) =>
      `<div class="decision ${i ? "ok" : ""}">${esc(x.t)}${chip(x.s)}</div>`).join("")}</div>`;
  shell({ d, tab: "arrival", body, head: jump });
}

const clip = (t, n) => t.split(" ").reduce((a, w) => (!a || (a + " " + w).length <= n) ? (a ? a + " " + w : w) : a, "");
const shortCol = t => t.split(/,| & | · /)[0];
function days(d, i) {
  const rows = d.chart.rows; i = Math.max(0, Math.min(rows.length - 1, i | 0)); const r = rows[i];
  const steps = `<nav class="steps" aria-label="Time points">${rows.map((x, j) =>
    `<button class="step ${j === i ? "on" : j < i ? "past" : ""} ${x.label.length > 12 ? "wide" : ""}" data-go="#/dx/${d.id}/days/${j}" ${j === i ? 'aria-current="step"' : ""}>
      <span class="ln"><i class="${j === 0 ? "none" : j <= i ? "dark" : ""}"></i><span class="d"></span><i class="${j === rows.length - 1 ? "none" : j < i ? "dark" : ""}"></i></span>
      <b>${esc(x.label)}</b><span>${esc(clip(x.phase, 15))}</span></button>`).join("")}</nav>`;
  const c = d.chart.columns; const cols = [["feed", c.feed], ["tests", c.tests], ["treatment", c.treatment]];
  const seg = Math.min(2, S.seg);
  const body =
    `<div class="dayhead"><span class="big">${esc(r.label)}</span><span class="ph">${esc(r.phase)}</span></div>` +
    (r.lead ? `<div class="lead">${esc(r.lead)}</div>` : "") +
    (i === 0 && d.chart.standing ? card(d, /\/|^time$/i.test(d.chart.unit) ? "Throughout — every shift" : /^visit$/i.test(d.chart.unit) ? "At every visit" : `Every ${d.chart.unit.toLowerCase()}, every shift`, d.chart.standing) : "") +
    `<div class="seg" role="tablist" aria-label="Chart columns">${cols.map(([k, t], j) =>
      `<button role="tab" data-seg="${j}" aria-selected="${j === seg}">${esc(shortCol(t))} <span>${(r[k] || []).filter(x => x.t).length}</span></button>`).join("")}</div>` +
    card(d, cols[seg][1], r[cols[seg][0]]) +
    (d.chart.phase_note ? `<p class="hint">${esc(d.chart.phase_note)}</p>` : "");
  const nx = rows[i + 1];
  const pager = `<div class="pager"><div class="in">
    <button class="prev" data-go="#/dx/${d.id}/days/${i - 1}" ${i === 0 ? "disabled" : ""} aria-label="Previous: ${i ? esc(rows[i - 1].label) : ""}">${ico("back")}</button>
    <button class="next" data-go="#/dx/${d.id}/days/${i + 1}" ${nx ? "" : "disabled"}>
      <span class="l"><small>${nx ? "Next · or swipe left" : "Last time point"}</small><b>${nx ? esc(nx.label + " — " + nx.phase) : esc(r.label)}</b></span>${nx ? ico("next") : ""}</button></div></div>`;
  shell({ d, tab: "days", body, head: steps, after: pager, mainCls: "withpager" });
  const on = $(".steps .on"); on && on.scrollIntoView({ inline: "center", block: "nearest" });
  swipe(d, i, rows.length);
}

const DOSE = /^((?:max\.?\s)?[\d.,]+(?:\s?[–-]\s?[\d.,]+)?\s?(?:U|IU|units?|mg|g|µg|mcg|mL|ml|mmol|L|drops?|tabs?|ampoules?)(?:\/(?:kg|h|min|day|dose))*(?:\s(?:IV|IM|SC|PO|SL|PR|IO|NGT|stat))?)(?=[\s,;·(]|$)/;
const WARN = /^(not |no |avoid|caution|contra|do not|don't|never|stop )|contraindicat/i;
function doseLine(d, it, hs) {
  const k = key(d.id, it); const w = WARN.test(it.t); const m = !w && it.t.match(DOSE);
  const rest = m ? it.t.slice(m[1].length).replace(/^[\s,;·]+/, "") : "";
  const txt = m ? `<b class="dose">${esc(m[1])}</b>${esc(rest)}` : esc(it.t);
  return `<div class="ln ${w ? "warn" : ""} ${it.b && !m ? "bold" : ""}">${w ? ico("warn") : ""}<div class="body"><span class="txt">${txt}${dag(it)}</span>${it.s !== hs ? chip(it.s) : ""}</div>${tick(k)}</div>`;
}
function differentials(d, focus) {
  const rows = d.chart.rows, dd = d.differentials; const sub = (t, a) => a && a.length ? `<h3 class="dsub">${t}</h3>${list(d, a)}` : "";
  const open = S.dxo[d.id] ||= new Set(); if (Number.isInteger(focus)) open.add(focus); // a deep link (#/dx/<id>/differentials/<n>) opens that card
  const texts = x => [x.dx, x.group, x.branch, ...["features", "confirm", "manage", "refer"].flatMap(k => (x[k] || []).map(i => i.t || i.h || ""))].filter(Boolean).join(" ").toLowerCase();
  const one = (x, i) => { const j = rows.findIndex(r => r.label === x.branch); // branch = label of the chart row this condition continues in
    const isOpen = open.has(i);
    return `<section class="card dxc ${isOpen ? "" : "closed"}" id="dx${i}" data-q="${esc(texts(x))}">
      <h2><button class="shead" data-dxtoggle="${i}" aria-expanded="${isOpen}"><span class="st">${esc(x.dx)}</span>${x.branch ? `<span class="hb">${esc(x.branch.replace(/^If /i, ""))}</span>` : ""}${ico("down")}</button></h2>
      ${j >= 0 ? `<div class="toolrow"><button class="btn" data-go="#/dx/${d.id}/days/${j}">Chart: ${esc(x.branch)}${ico("next")}</button></div>` : ""}
      ${sub("Features", x.features)}${sub("Confirm", x.confirm)}${sub("Manage", x.manage)}${sub("Refer", x.refer)}</section>`; };
  const names = []; dd.forEach(x => { const g = x.group || ""; if (!names.includes(g)) names.push(g); }); // optional x.group: sections in order of first use
  const grouped = names.some(g => g);
  const body = `<p class="hint">Tap a condition to open it. “Chart” on a card opens the timeline row for that branch.</p>` + (grouped
    ? names.map((g, gi) => { const mine = dd.map((x, i) => [x, i]).filter(([x]) => (x.group || "") === g);
        return `<section class="dgrp"><h2 class="glabel dg" id="dg${gi}">${esc(g || "Other")}<span class="c">· <span class="gc">${mine.length}</span></span></h2>${mine.map(([x, i]) => one(x, i)).join("")}</section>`; }).join("")
    : `<section class="dgrp">${dd.map(one).join("")}</section>`) + `<p class="empty" id="dnone" hidden>No condition matches.</p>`;
  const head = `<div class="dsearch"><label class="search">${ico("search")}<span class="sr">Search conditions</span>
      <input id="dxq" type="search" placeholder="Search conditions…" autocomplete="off"></label>
      <button class="btn" data-dxall="toggle" aria-label="Expand or collapse all conditions">Expand all</button></div>` +
    (grouped && names.length > 1 ? `<nav class="boxnav" aria-label="Groups">${names.map((g, gi) => `<button class="fchip" data-jump="dg${gi}">${esc(g || "Other")}</button>`).join("")}</nav>` : "");
  shell({ d, tab: "differentials", body, head });
  dxAllLabel();
  const t = Number.isInteger(focus) && $("#dx" + focus); if (t) { t.scrollIntoView({ block: "start" }); t.classList.add("flash"); }
}
// the "Expand all" button offers whichever action applies to the cards currently shown
function dxAllLabel() { const b = $("[data-dxall]"); if (!b) return; const v = $$("section.dxc").filter(c => !c.hidden); b.textContent = v.length && v.every(c => !c.classList.contains("closed")) ? "Collapse all" : "Expand all"; }
function dxFilter() {
  const q = ($("#dxq")?.value || "").trim().toLowerCase(); let any = 0;
  $$(".dgrp").forEach(g => { let n = 0;
    $$("section.dxc", g).forEach(c => { const ok = !q || q.split(/\s+/).every(w => c.dataset.q.includes(w)); c.hidden = !ok; if (ok) n++; });
    g.hidden = !n; const gc = $(".gc", g); if (gc) gc.textContent = n; any += n; });
  $("#dnone").hidden = !!any; dxAllLabel();
}
function dxSet(c, on) { // open / close one card and remember it for this pathway
  const id = (location.hash || "").slice(2).split("/")[1], n = +c.id.slice(2), set = S.dxo[id] ||= new Set();
  c.classList.toggle("closed", !on); on ? set.add(n) : set.delete(n); $(".shead", c)?.setAttribute("aria-expanded", on);
}

/* ---------- hub page: one list entry (e.g. Fracture) that opens every site, per population ---------- */
async function hubView(id) {
  const h = (S.index.hubs || []).find(x => x.id === id); if (!h) throw new Error("unknown group " + id);
  const ds = await Promise.all(h.members.map(m => getDx(m.id)));
  const k = Math.max(0, Math.min(h.members.length - 1, S.hub[id] ?? 0)), m = h.members[k], d = ds[k];
  const dd = d.differentials || [], names = [];
  dd.forEach(x => { const g = x.group || ""; if (!names.includes(g)) names.push(g); });
  const rowsHtml = names.map(g => { const mine = dd.map((x, i) => [x, i]).filter(([x]) => (x.group || "") === g);
    return `<section class="grp"><h2 class="glabel">${esc(g || "Other")}<span class="c">· <span class="gc">${mine.length}</span></span></h2>
      <div class="list">${mine.map(([x, i]) => `<button class="dx hx" data-go="#/dx/${d.id}/differentials/${i}" data-q="${esc((x.dx + " " + g + " " + (x.branch || "")).toLowerCase())}">
        <span class="hn">${esc(x.dx)}</span>${x.branch ? `<span class="hb">${esc(x.branch.replace(/^If /i, ""))}</span>` : ""}${ico("next")}</button>`).join("")}</div></section>`; }).join("");
  app.innerHTML = `
  <header class="top"><div class="hometop">
    <div class="brand"><button class="iconbtn" aria-label="Back to all pathways" data-go="#/diagnoses">${ico("back")}</button>
      <div class="ttl"><h1>${esc(h.short)}</h1><div class="sub">${esc((h.tags?.system || []).join(" · "))} · ${dd.length} sites · works offline</div></div></div>
    <div class="seg2" role="group" aria-label="Population">${h.members.map((x, i) => `<button data-hubpop="${esc(id)}|${i}" aria-pressed="${i === k}">${esc(x.label)}<small>${esc(x.note || "")}</small></button>`).join("")}</div>
    <label class="search">${ico("search")}<span class="sr">Search sites</span>
      <input id="hq" type="search" placeholder="Search site — e.g. clavicle, ankle, hip" autocomplete="off"></label>
  </div></header>
  <main class="fade home hub">
    <button class="btn wide" data-go="#/dx/${d.id}/arrival"><span>Open the ${esc(m.label.toLowerCase())} pathway: arrival, timeline, doses, nursing</span>${ico("next")}</button>
    ${rowsHtml}<p class="empty" id="hnone" hidden>No site matches.</p>
    <p class="hint">${esc(d.population)}. Tap a site for its features, confirmation, management and when to refer. † = not in the SA guideline.</p></main>`;
}
/* ---------- Fluids Rx hub (#/fluids): Adult | Paediatric, with "which fluid — all ages" shown under each (same page layout as the Fracture hub) ---------- */
function fluidsHub() {
  const fl = S.index.fluids || [], h = S.index.fluids_hub || { short: "Fluids Rx", members: [{ label: "Adult", pop: "Adult" }, { label: "Paediatric", pop: "Paediatric" }], all: "Which fluid — all ages" };
  const k = Math.max(0, Math.min(h.members.length - 1, S.hub.fluids ?? 0)), m = h.members[k];
  const all = fl.filter(e => e.pop === "Adult + paeds"), mine = fl.filter(e => e.pop === m.pop);
  const group = (title, items) => `<section class="grp"><h2 class="glabel">${esc(title)}<span class="c">· <span class="gc">${items.length}</span></span></h2>
    <div class="list">${items.map(e => `<button class="dx hx" data-go="#/proc/${e.id}/procedure" data-q="${esc([e.short, e.title, ...(e.tags || [])].join(" ").toLowerCase())}">
      <span class="hn">${esc(e.short.replace(/^Fluids – /, "").replace(/ \((adult|child)\)$/, ""))}</span><span class="hb">${esc(e.title)}</span>${ico("next")}</button>`).join("")}</div></section>`;
  app.innerHTML = `
  <header class="top"><div class="hometop">
    <div class="brand"><button class="iconbtn" aria-label="Back to scales and calculations" data-go="#/scores">${ico("back")}</button>
      <div class="ttl"><h1>${esc(h.short)}</h1><div class="sub">${mine.length + all.length} cards for ${esc(m.label.toLowerCase())} · works offline</div></div></div>
    <div class="seg2" role="group" aria-label="Population">${h.members.map((x, i) => `<button data-hubpop="fluids|${i}" aria-pressed="${i === k}">${esc(x.label)}<small>${esc(x.note || "")}</small></button>`).join("")}</div>
    <label class="search">${ico("search")}<span class="sr">Search fluids</span>
      <input id="hq" type="search" placeholder="Search — e.g. burns, DKA, neonate, maintenance" autocomplete="off"></label>
  </div></header>
  <main class="fade home hub">${group(h.all || "Which fluid — all ages", all)}${group(m.label + " fluids", mine)}<p class="empty" id="hnone" hidden>No fluid card matches.</p>
    <p class="hint">Prescribe fluid like a drug: indication · fluid · volume · rate · review time. † = not in the SA guideline.</p></main>`;
}
function hubFilter() {
  const q = ($("#hq")?.value || "").trim().toLowerCase(); let any = 0;
  $$("main.hub .grp").forEach(g => { let n = 0;
    $$(".dx", g).forEach(b => { const ok = !q || q.split(/\s+/).every(w => b.dataset.q.includes(w)); b.hidden = !ok; if (ok) n++; });
    g.hidden = !n; $(".gc", g).textContent = n; any += n; });
  $("#hnone").hidden = !!any;
}

function doses(d) {
  const nav = `<nav class="boxnav" aria-label="Dose boxes">${d.boxes.map((b, i) => `<button class="fchip" data-jump="b${i}">${esc(b.title)}</button>`).join("")}
    <button class="fchip" data-jump="bdis">${esc(d.discharge.title)}</button><button class="fchip" data-jump="bfu">${esc(d.followup.title)}</button></nav>`;
  const box = (b, i) => {
    const groups = []; let g = null;
    (b.items || []).forEach(it => { if (it.h && !it.t) { g = { h: it, lines: [] }; groups.push(g); } else { if (!g) { g = { h: null, lines: [] }; groups.push(g); } g.lines.push(it); } });
    return `<article class="box" id="b${i}"><h2>${esc(b.title)}</h2>${groups.map(g => `<div class="drug">
      ${g.h ? `<div class="dh"><h3>${esc(g.h.h)}${dag(g.h)}</h3>${chip(g.h.s)}</div>` : ""}${g.lines.map(it => doseLine(d, it, g.h && g.h.s)).join("")}</div>`).join("")}</article>`;
  };
  const body = d.boxes.map(box).join("") +
    `<div id="bdis" style="scroll-margin-top:84px">${card(d, d.discharge.title, d.discharge.items)}</div>` +
    `<div id="bfu" style="scroll-margin-top:84px">${card(d, d.followup.title, d.followup.items)}</div>`;
  shell({ d, tab: "doses", body, head: nav });
}

function nursing(d) {
  const n = d.nursing;
  const body = `<p class="hint">${esc(n.title)}. ${esc(n.period)}.</p>` + card(d, "Call the doctor", n.call, "red") +
    n.params.map(p => card(d, p.h, p.items)).join("") + card(d, "Totals each sheet", n.totals.map(t => ({ t })));
  shell({ d, tab: "nursing", body });
}

/* Guideline files found through page-map.json: one row per catalogue document (a whole book, or one part of the split hospital STG).
   The page adjustment is added to the catalogue page, for an edition that differs from the one the catalogue was built on. */
const docKeysFor = ids => ids.flatMap(i => { const id = S.sources[i]?.alias || i; return Object.values(S.pm?.books?.[id] || {}).map(([doc]) => "doc:" + doc); });
async function docRowsHtml(keys) {
  return (await Promise.all([...new Set(keys)].map(async k => { const dm = S.pm?.docs?.[k.slice(4)]; if (!dm) return ""; const has = await getPdf(k);
    return `<div class="srow"><div class="t">${esc(dm.title)} — chapters ${esc(dm.chapters)}</div><div class="e">${esc(dm.file)} · ${dm.pages} pages</div>
      <div class="acts"><span class="status ${has ? "ok" : "no"}">${has ? "PDF on this phone" : "No PDF loaded"}</span>
      <label class="btn primary">${has ? "Replace PDF" : "Load PDF"}<input type="file" accept="application/pdf" data-load="${k}" hidden></label>${has ? `<button class="btn" data-del="${k}">Remove</button>` : ""}</div>
      <div class="acts off"><label>Page adjustment <input type="number" inputmode="numeric" value="${S.offsets[k] ?? 0}" data-off="${k}"></label><span class="hint">0 unless your edition differs from the catalogue</span></div></div>`; }))).join("");
}
async function sources(d) {
  const units = d.sources.flatMap(id => { const s = S.sources[id] || { id, short: id, title: id, edition: "" };
    return s.chapters ? Object.entries(s.chapters).map(([c, ch]) => ({ key: id + ":" + c, s, title: s.short + " — " + ch.title })) : [{ key: id, s, title: s.title }]; });
  const rows = await Promise.all(units.map(async u => {
    const { s, key: id } = u;
    if (s.type === "online") return `<div class="srow"><div class="t">${esc(u.title)}</div><div class="e">${esc(s.edition || "")}</div>
      <div class="acts"><span class="status ok">Online source — no PDF to load</span>${s.url ? `<a class="btn primary" href="${esc(s.url)}" target="_blank" rel="noopener">Open online${ico("next")}</a>` : ""}</div></div>`;
    const has = await getPdf(id);
    const off = S.offsets[id] ?? (s.chapters ? s.chapters[id.split(":")[1]].offset : s.offset) ?? 0;
    return `<div class="srow"><div class="t">${esc(u.title)}</div><div class="e">${esc(s.edition)}</div>
      <div class="acts"><span class="status ${has ? "ok" : "no"}">${has ? "PDF on this phone" : "No PDF loaded"}</span>
      <label class="btn primary">${has ? "Replace PDF" : "Load PDF"}<input type="file" accept="application/pdf" data-load="${id}" hidden></label>
      ${has ? `<button class="btn" data-del="${id}">Remove</button>` : ""}</div>
      <div class="acts off"><label>Page offset <input type="number" inputmode="numeric" value="${off}" data-off="${id}"></label>
      <span class="hint">PDF page minus printed page</span></div></div>`;
  }));
  const dr = await docRowsHtml(docKeysFor(d.sources));
  shell({ d, tab: "sources", body: `<p class="hint">Guideline PDFs are stored only on this phone, so they work offline. Loading a newer edition replaces the old one; the page offset may then need adjusting.</p>${dr ? `<h2 class="glabel">Guideline files (STG chapter.page cites open the right page)</h2>${dr}<h2 class="glabel">Older: one PDF per chapter</h2>` : ""}${rows.join("")}` });
}

/* ---------- overflow menu ---------- */
function toggleMenu(d) {
  const m = $(".menu"); if (m) { m.remove(); $(".scrim")?.remove(); return; }
  document.body.insertAdjacentHTML("beforeend", `<div class="scrim" data-closemenu></div><div class="menu" role="menu">
    <button role="menuitem" id="vm">Verify mode<span class="state">${S.verify ? "On" : "Off"}</span></button>
    <button role="menuitem" data-resetchk="${d.id}">Reset checklist</button>
    <button role="menuitem" data-go="#/diagnoses">All pathways</button></div>`);
}

/* ---------- swipe between chart rows ---------- */
function swipe(d, i, n) {
  let x0 = null, y0 = null; const m = $("main");
  m.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  m.addEventListener("touchend", e => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    const j = i + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && j >= 0 && j < n) location.hash = `#/dx/${d.id}/days/${j}`;
  }, { passive: true });
}

/* ---------- PDF viewer ---------- */
let pdfjs = null;
async function openSource(src) {
  const r = resolveSrc(src), s = r.s, pg = r.pg, id = r.pdf;
  const printed = parseInt(pg, 10) || 1;
  const v = document.createElement("div"); v.className = "viewer";
  v.innerHTML = `<div class="vbar"><button data-x>Close</button><span class="vt">${esc(r.chapter ? s.short + " Ch" + r.chapter : s.short)} · ${r.num ? "printed p" + printed : esc(pg) + " (page 1 shown)"}</span>
    <button data-p="-1" aria-label="Previous page">‹</button><button data-p="1" aria-label="Next page">›</button>
    <button data-z="-1" aria-label="Zoom out">−</button><button data-z="1" aria-label="Zoom in">+</button></div><div class="stage"></div>`;
  document.body.appendChild(v); const stage = $(".stage", v);
  v.querySelector("[data-x]").onclick = () => v.remove();
  // 1) the guideline file named by page-map.json (r.doc, page already worked out); 2) an older per-chapter PDF (r.pdf + its offset)
  let blob = r.doc ? await getPdf(r.doc) : null; const mapped = blob ? r.mapped : null;
  if (!blob) blob = await getPdf(id);
  const off = mapped != null ? mapped - printed : Number(r.offset);
  if (!blob) { const dm = r.doc && S.pm?.docs?.[r.doc.slice(4)];
    stage.innerHTML = `<div class="msg">No PDF loaded for ${esc(s.title)}.<br><br>${dm ? `Load <b>${esc(dm.file)}</b> (${esc(s.short)}, chapters ${esc(dm.chapters)}) from the Sources page of a card that cites it.` : "Open the Sources tab and load it from your phone."} It stays available offline.</div>`; return; }
  try {
    pdfjs = pdfjs || await import("./vendor/pdfjs/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer(), standardFontDataUrl: "vendor/pdfjs/standard_fonts/" }).promise;
    let page = Math.min(doc.numPages, Math.max(1, printed + off)), zoom = 1;
    const draw = async () => {
      const p = await doc.getPage(page); const base = p.getViewport({ scale: 1 });
      const scale = (stage.clientWidth - 16) / base.width * zoom; const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr }); const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height; c.style.width = vp.width / dpr + "px";
      await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      stage.replaceChildren(c); $(".vt", v).textContent = `${r.chapter ? s.short + " Ch" + r.chapter : s.short} · printed p${page - off} · PDF p${page}/${doc.numPages}`;
    };
    v.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { page = Math.min(doc.numPages, Math.max(1, page + +b.dataset.p)); draw(); });
    v.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zoom = Math.min(3, Math.max(.6, zoom * (b.dataset.z > 0 ? 1.3 : 1 / 1.3))); draw(); });
    await draw();
  } catch (e) { stage.innerHTML = `<div class="msg">Could not open the PDF: ${esc(e.message)}</div>`; }
}

/* ---------- scales and calculations (index.json "scores", data/<file>) ---------- */
const SC_COLOURS = ["#1d4ed8", "#047857", "#b45309", "#6d28d9", "#0f766e"]; // E blue, V green, M amber, then 4th / 5th component
const fmtN = n => String(Math.round(n * 10) / 10);
/* Calculator registry: formula id -> numeric inputs + a plain function (no eval, nothing parsed from the JSON expr).
   To add a calculator, add an entry here; the formulas panel renders its inputs and live result automatically.
   The gcs_total formula is not listed: it is computed from the scorer above (E + V + M). */
const CALCS = {
  target_map_paeds_tbi: { unit: "mmHg", inputs: [{ k: "age", label: "Age", unit: "years", min: 0, max: 18 }], fn: REG.target_map_paeds_tbi },
  cpp: { unit: "mmHg", inputs: [{ k: "map", label: "MAP", unit: "mmHg", min: 0, max: 250 }, { k: "icp", label: "ICP", unit: "mmHg", min: 0, max: 100 }],
    fn: REG.cpp, band: [40, 50] },
  min_sbp_child: { unit: "mmHg", inputs: [{ k: "age", label: "Age", unit: "years", min: 0, max: 18 }], fn: REG.min_sbp_child },
};
function calcOut(id) {
  const c = CALCS[id], v = {};
  for (const i of c.inputs) { const raw = String(S.sc.vars[i.k] ?? "").trim(), n = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(n)) return `<span class="muted">Enter ${c.inputs.map(x => x.label).join(" and ")}</span>`;
    if (n < i.min || n > i.max) return `<span class="bad">${i.label} should be ${i.min}–${i.max} ${i.unit}</span>`;
    v[i.k] = n; }
  const r = c.fn(v);
  const flag = c.band ? (r < c.band[0] ? " <span class=\"bad\">below target</span>" : r > c.band[1] ? " <span class=\"bad\">above target</span>" : " <span class=\"good\">in target</span>") : "";
  return `<b class="cv">${fmtN(r)}</b> ${esc(c.unit)}${flag}`;
}
function calcRefresh() { $$("[data-out]").forEach(o => { if (CALCS[o.dataset.out]) o.innerHTML = calcOut(o.dataset.out); }); }

const scRef = (src, cls = "") => { // small grey source tag; STG refs open the guideline PDF at that page, online sources open their URL
  if (!src) return "";
  const s = S.sources[src.split(":")[0]];
  if (s?.url && !src.includes(":")) return `<a class="ref ${cls}" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.short || src)}</a>`;
  return `<button class="ref ${cls}" data-src="${esc(src)}" aria-label="Open ${esc(src.replace(":", " "))}">${esc(src.replace(":", " "))}</button>`;
};
const scCor = (id, c) => c ? `<button class="cor" data-cor="${esc(id)}" aria-expanded="${S.sc.cor.has(id)}" aria-label="STG misprint corrected: tap for note">‡</button>` : "";
const scCorNote = (id, c) => c && S.sc.cor.has(id) ? `<div class="cnote">${esc(c)}</div>` : "";
const scDag = on => on ? '<span class="dag red" title="Not in the SA STG">†</span>' : "";

function scValidate(d) { // console warnings only: bad data should never stop the card opening
  const bad = [], seen = new Set();
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if ((k === "s" || k.startsWith("s_")) && typeof v === "string") seen.add(v); else walk(v); } };
  walk(d); (d.sources || []).forEach(x => seen.add(x.id));
  [...seen].forEach(s => { const id = s.split(":")[0]; if (!S.sources[id]) bad.push(`source "${id}" (from "${s}") is not in sources.json`); });
  const r = d.formulas?.[0]?.range, lo = d.components.reduce((a, c) => a + c.min, 0), hi = d.components.reduce((a, c) => a + c.max, 0);
  if (!r || r[0] !== lo || r[1] !== hi) bad.push(`component min/max sum ${lo}–${hi} does not match formulas[0].range ${r ? r.join("–") : "(missing)"}`);
  if (bad.length) console.warn(`Score card ${d.id}:\n - ` + bad.join("\n - "));
}

function scoresHome() {
  const ss = (S.index.scores || []).filter(e => !e.hidden), pops = [...new Set(ss.map(e => popName(e.population)))];
  const fl = S.index.fluids || [], fh = S.index.fluids_hub || { short: "Fluids Rx", title: "IV fluids" }; // Fluids Rx: procedure-style cards (data/fluids-*.json) behind one hub row
  const tags = [...new Set([...ss, ...fl].flatMap(e => e.tags || []))].sort((a, b) => a.localeCompare(b));
  const lists = pops.map(g => { const items = ss.filter(e => popName(e.population) === g);
    return `<section class="grp" data-grp="${esc(g)}"><h2 class="glabel"><span class="dot ${popClass(items[0].population)}"></span>${esc(g)}<span class="c">· <span class="gc">${items.length}</span></span></h2>
      <div class="list">${items.map(e => `<button class="dx" data-go="#/score/${e.id}" data-pop="${esc(popName(e.population))}" data-q="${esc([e.short, e.title, e.population, e.age_range, e.id, ...(e.tags || [])].join(" ").toLowerCase())}" data-tags="${esc((e.tags || []).join("|"))}">
        <span class="t">${esc(e.short)}</span><span class="p">${esc(e.title)} · ${esc(e.age_range)} <span class="tbadge">${esc(TYPE_LABEL[e.type] || e.type)}</span></span>${ico("next")}</button>`).join("")}</div></section>`; }).join("")
    // Fluids Rx is ONE row (like Fracture in the pathways list) that opens #/fluids: Adult | Paediatric, "which fluid" under each. It shows under either population filter.
    + (fl.length ? `<section class="grp" data-grp="Adult + paeds"><h2 class="glabel"><span class="dot pop-tox"></span>Adult + paeds<span class="c">· <span class="gc">1</span></span></h2>
      <div class="list"><button class="dx" data-go="#/fluids" data-pop="Adult + paeds" data-q="${esc(["fluids rx", fh.title, ...fl.flatMap(e => [e.short, e.title, ...(e.tags || [])])].join(" ").toLowerCase())}" data-tags="${esc([...new Set(fl.flatMap(e => e.tags || []))].join("|"))}">
        <span class="t">${esc(fh.short)}</span><span class="p">${esc(fh.title)} · ${fl.length} cards <span class="tbadge">Fluids</span></span>${ico("next")}</button></div></section>` : "");
  app.innerHTML = `
  <header class="top"><div class="hometop"><div class="brand"><button class="iconbtn" aria-label="Back to start" data-go="#/">${ico("back")}</button>
    <div class="ttl"><h1>Scales and Calculations</h1><div class="sub">ANDH · ${ss.length + fl.length} cards · works offline</div></div></div>
    <label class="search">${ico("search")}<span class="sr">Search scales</span><input id="sq" type="search" placeholder="Search — e.g. GCS, head injury, MAP" autocomplete="off"></label>
    <div class="chips">${["All", ...pops].map(g => `<button class="fchip" data-spop="${g === "All" ? "All" : esc(g)}" aria-pressed="${S.spop === g}">${esc(g)}</button>`).join("")}</div>
    <div class="chips sys" aria-label="Tags">${["All", ...tags].map(g => `<button class="fchip" data-stag="${esc(g)}" aria-pressed="${S.stag === g}">${esc(g)}</button>`).join("")}</div></div></header>
  <main class="fade home scores">${lists}<p class="empty" id="none" hidden>No scale matches.</p>
    <p class="hint">† = clinical or local addition, not in the SA guideline. ‡ = STG misprint corrected.</p></main>`;
  applyScoreFilter();
}
function applyScoreFilter() {
  const q = ($("#sq")?.value || "").trim().toLowerCase(); let any = 0;
  $$(".grp").forEach(g => {
    let n = 0; // population chips filter per row; an "Adult + paeds" card (which fluid) belongs to both
    $$(".dx", g).forEach(b => { const ok = (S.spop === "All" || b.dataset.pop === S.spop || b.dataset.pop === "Adult + paeds") && (S.stag === "All" || b.dataset.tags.split("|").includes(S.stag)) && (!q || q.split(/\s+/).every(w => b.dataset.q.includes(w))); b.hidden = !ok; if (ok) n++; });
    g.hidden = !n; $(".gc", g).textContent = n; any += n;
  });
  $("#none").hidden = !!any;
  $$(".fchip[data-spop]").forEach(b => b.setAttribute("aria-pressed", b.dataset.spop === S.spop));
  $$(".fchip[data-stag]").forEach(b => b.setAttribute("aria-pressed", b.dataset.stag === S.stag));
}

/* scorer maths and rendering */
function scCalc(d) {
  const vt = !!(S.sc.tube || S.sc.vent), sel = S.sc.sel; // intubated or ventilated: V is recorded as T and left out of the total
  const used = d.components.filter(c => !(vt && c.key === "V"));
  const total = used.reduce((a, c) => a + (sel[c.key] ?? 0), 0);
  return { vt, used, total, picked: used.filter(c => sel[c.key] != null).length, complete: used.every(c => sel[c.key] != null) };
}
const scEq = (d, m) => d.components.map((c, i) => `<span class="eq" style="--c:${SC_COLOURS[i % 5]}">${m.vt && c.key === "V" ? "VT" : c.key + (S.sc.sel[c.key] ?? "–")}</span>`).join(" ");
function scBands(d, m) { // bands whose min <= total <= max; for an intubated total the floor is the scale minimum (2T behaves as 3)
  if (!m.complete) return [];
  const t = m.vt ? Math.max(m.total, d.formulas[0].range[0]) : m.total;
  return [...(d.interpretation_stg || []), ...(d.interpretation_classic || [])].filter(b => b.min <= t && t <= b.max);
}
const shortLbl = b => { const l = b.label.split(" — ")[0].split(":")[0]; return /\d/.test(l) ? `${b.min}–${b.max}` : `${l} ${b.min}–${b.max}`; };
/* --- the tappable GCS wheel (wheel/gcs-wheel-<age>.svg, inlined; sectors carry data-d = E|V|M and data-s = score) --- */
const WHEEL_AGES = [["adult", "> 5 years"], ["child", "2–5 years"], ["infant", "0–23 months"]];
async function wheelLoad() { // fetched once, then served from the service-worker cache, so it works offline
  if (S.wheel) return;
  try { const w = {}; await Promise.all(WHEEL_AGES.map(async ([a]) => { const r = await fetch(`wheel/gcs-wheel-${a}.svg`); if (!r.ok) throw new Error(r.status); w[a] = await r.text(); })); S.wheel = w; }
  catch (e) { console.warn("GCS wheel could not be loaded:", e.message); }
}
function scTop(d) {
  const wheel = a => S.wheel?.[a] ?? `<p class="empty">The wheel could not be loaded. Open the app once with signal.</p>`;
  return `<h2 class="wheel-h">Glasgow Coma Scale (GCS)</h2>
    <div class="wage" role="group" aria-label="Age">${WHEEL_AGES.map(([k, l]) => `<label class="wchk"><input type="checkbox" data-gage="${k}" ${S.sc.age === k ? "checked" : ""}> ${l}</label>`).join("")}</div>
    <div class="wplate">${WHEEL_AGES.map(([k]) => `<div data-wbox="${k}" ${S.sc.age === k ? "" : "hidden"}>${wheel(k)}</div>`).join("")}</div>
    <div class="wair" role="group" aria-label="Airway"><label class="wchk"><input type="checkbox" data-gair="tube" ${S.sc.tube ? "checked" : ""}> Intubated (tube)</label>
      <label class="wchk"><input type="checkbox" data-gair="vent" ${S.sc.vent ? "checked" : ""}> Ventilated</label></div>
    <section class="wres" aria-live="polite"><span class="wscore" id="wscore">–</span><span class="wparts" id="wparts">E– V– M–</span><span class="wchipr" id="wchip"></span><span class="spacer"></span><button class="wreset" data-greset>Reset</button></section>
    <p class="hint">Tap NORMAL or SPEECH to see their higher scores in the outer ring. Intubated or ventilated scores verbal as T.</p>
    <p class="wsrc" id="wsrc"></p>`;
}
function wheelPaint() { // port of the reference wheel: select / dim / outline the sectors, centre total, result line and severity chip
  const d = S.sc.d, box = $(`[data-wbox="${S.sc.age}"]`), svg = box && $("svg", box); if (!svg) return;
  const m = scCalc(d), sel = S.sc.sel, hl = $(".hl", svg); hl.innerHTML = "";
  $$(".opt", svg).forEach(p => { const dom = p.dataset.d, v = +p.dataset.s; p.classList.remove("dim", "off");
    if (dom === "V" && m.vt) { p.classList.add("off"); return; }
    if (sel[dom] != null) { if (sel[dom] === v) { const c = document.createElementNS("http://www.w3.org/2000/svg", "path"); c.setAttribute("d", p.getAttribute("d")); hl.appendChild(c); } else p.classList.add("dim"); } });
  const parts = `E${sel.E ?? "–"} V${m.vt ? "T" : sel.V ?? "–"} M${sel.M ?? "–"}`, main = $(".res-main", svg), sub = $(".res-sub", svg), chip = $("#wchip");
  $("#wparts").textContent = parts;
  if (!m.complete) { $("#wscore").textContent = "–"; main.textContent = "GCS"; sub.textContent = parts; chip.className = "wchipr"; chip.textContent = "Tap one Eyes, Verbal and Motor section"; }
  else if (m.vt) { const t = m.total + "T"; $("#wscore").textContent = t; main.textContent = t; sub.textContent = parts; chip.className = "wchipr"; chip.textContent = "Verbal not testable (E + M only)"; }
  else { const t = m.total; $("#wscore").textContent = t + "/15"; main.textContent = t; sub.textContent = parts;
    if (t >= 13) { chip.className = "wchipr mild"; chip.textContent = "Mild (13–15)"; } else if (t >= 9) { chip.className = "wchipr mod"; chip.textContent = "Moderate (9–12)"; } else { chip.className = "wchipr sev"; chip.textContent = "Severe (≤ 8): protect airway"; } }
  const inf = S.sc.age === "infant" && d.components[0].s_infant, src = inf ? d.components[0].s_infant : d.components[0].s;
  $("#wsrc").innerHTML = `${inf ? "Infant column" : "Wheel"} from ${scRef(src)}${scDag(inf ? d.components[0].d_infant : d.components[0].d)}`;
}
function wheelTap(p) { // a sector: tap = select, tap again = clear. NORMAL / SPEECH only pulse the outer-ring sectors and never score.
  const svg = p.closest("svg");
  if (p.classList.contains("grp")) { $$(`.opt[data-d="${p.dataset.d}"]`, svg).forEach(o => { if (+o.dataset.s >= 4) { o.classList.remove("hint"); void o.getBBox(); o.classList.add("hint"); setTimeout(() => o.classList.remove("hint"), 950); } }); return; }
  if (p.classList.contains("off")) return;
  const k = p.dataset.d, v = +p.dataset.s, sel = S.sc.sel; if (sel[k] === v) delete sel[k]; else sel[k] = v;
  scUpdate();
}
document.addEventListener("click", e => { const p = e.target.closest?.(".wheel-svg .opt, .wheel-svg .grp"); if (p && S.sc?.d?.input === "wheel") wheelTap(p); });
document.addEventListener("change", e => {
  const t = e.target; if (S.sc?.d?.input !== "wheel") return;
  if (t.dataset.gage) { S.sc.age = t.dataset.gage; S.sc.sel = {}; // behaves like a radio group; switching age resets the score
    $$("[data-gage]").forEach(c => { c.checked = c.dataset.gage === S.sc.age; }); $$("[data-wbox]").forEach(b => { b.hidden = b.dataset.wbox !== S.sc.age; }); scUpdate(); }
  if (t.dataset.gair) { S.sc[t.dataset.gair] = t.checked; scUpdate(); }
});
function scTotal(d, m = scCalc(d)) {
  const r = d.formulas[0].range, sel = S.sc.sel, bands = scBands(d, m).filter(b => b.label);
  return `<div class="totalbox ${m.complete ? "done" : ""}" aria-live="polite"><div class="tline"><span class="tl">Total</span><span class="eqs">${scEq(d, m)}</span><span class="tv">= ${m.picked ? m.total + (m.vt ? "T" : "") : "–"}</span></div>
      <div class="tsub">${m.complete ? bands.map(b => `<span class="lvl lvl-${b.level}">${esc(shortLbl(b))}</span>`).join("") || `Range ${r[0]}–${r[1]}` : `Incomplete — ${m.used.length - m.picked} of ${m.used.length} to select (${m.used.filter(c => sel[c.key] == null).map(c => c.key).join(", ")})`}
      ${m.picked ? `<button class="clr" data-scclear>Clear</button>` : ""}</div></div>`;
}
function scInterp(d) {
  const m = scCalc(d), t = m.complete ? (m.vt ? Math.max(m.total, d.formulas[0].range[0]) : m.total) : null, on = b => t !== null && b.min <= t && t <= b.max;
  const rng = b => b.min === b.max ? b.min : `${b.min}–${b.max}`;
  const row = (b, id, txt) => `<li class="band lvl-${b.level} ${on(b) ? "on" : t !== null ? "dim" : ""}"><span class="rng">${rng(b)}</span><div class="body"><span class="txt">${txt}${scDag(b.d)}${scCor(id, b.c)}</span>${scCorNote(id, b.c)}${scRef(b.s)}</div></li>`;
  const stg = d.interpretation_stg || [], cl = d.interpretation_classic || [];
  return `<h2 class="ctitle">Interpretation <span class="cs2">${t === null ? "select all components" : (m.total + (m.vt ? "T" : ""))}</span></h2>
    ${stg.length ? `<h3 class="dsub">SA STG</h3><ul class="items bands">${stg.map((b, i) => row(b, "stg" + i, esc(b.t))).join("")}</ul>` : ""}
    ${cl.length ? `<h3 class="dsub">Classic bands</h3><ul class="items bands">${cl.map((b, i) => row(b, "cl" + i, esc(b.label))).join("")}</ul>` : ""}`;
}
function scUpdate() {
  const d = S.sc.d; // only the parts of the current tab exist
  if ($("#sc-top")) wheelPaint(); if ($("#sc-interp")) $("#sc-interp").innerHTML = scInterp(d); if ($("#sc-mini")) $("#sc-mini").innerHTML = scTotal(d);
  $$("[data-out='gcs_total']").forEach(o => { const m = scCalc(d); o.innerHTML = `${scEq(d, m)} <b class="cv">= ${m.picked ? m.total + (m.vt ? "T" : "") : "–"}</b>`; });
  calcRefresh();
}

async function scoreView(id, tab, key) {
  const e = (S.index.scores || []).find(x => x.id === id); if (!e) throw new Error("unknown scale " + id);
  const d = S.sd[id] ||= await loadJSON("data/" + e.file);
  if (d.versions) return checkView(id, e, d); // checklist score cards (Wells PE / DVT)
  if (d.type === "calculator") return calcView(id, d, tab, key);
  if (d.type === "range") return rangeView(id, d, tab);
  if (!S.sc || S.sc.id !== id) { // fresh card: nothing carries over between patients, nothing is stored
    S.sc = { id, d, sel: {}, tube: false, vent: false, age: id === "gcs-paeds" ? "infant" : "adult", vars: {}, cor: new Set() }; scValidate(d); }
  if (!tab || tab === "scale") await wheelLoad();
  S.sc.d = d;
  const r = d.formulas[0].range;
  const fm = f => { const c = CALCS[f.id], live = f.id === "gcs_total";
    return `<div class="fm"><div class="fh"><b>${esc(f.name)}</b>${scDag(f.d)}${scRef(f.s)}</div><div class="fx">${esc(f.expr)}</div>
      ${live ? `<div class="fo" data-out="gcs_total"></div>` : ""}
      ${c ? `<div class="fin">${c.inputs.map(i => `<label>${esc(i.label)}<span class="inp"><input type="number" inputmode="decimal" min="${i.min}" max="${i.max}" step="any" data-var="${i.k}" value="${esc(S.sc.vars[i.k] ?? "")}" autocomplete="off"><em>${esc(i.unit)}</em></span></label>`).join("")}</div>
        <div class="fo" data-out="${f.id}"></div>` : ""}
      ${!c && f.vars && live ? `<ul class="fvars">${Object.entries(f.vars).map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join("")}</ul>` : ""}
      <div class="fmeta">${[f.range ? `Range ${f.range[0]}–${f.range[1]}` : "", f.target || "", f.units && !c ? f.units : "", f.notation || ""].filter(Boolean).map(esc).join(" · ")}</div></div>`; };
  const notes = (d.notes || []).length ? `<section class="card"><h2 class="ctitle">Notes and pearls</h2><ul class="items">${d.notes.map(n =>
    `<li><div class="body"><span class="txt">${esc(n.t)}${scDag(n.d)}</span>${scRef(n.s)}</div></li>`).join("")}</ul></section>` : "";
  const extra = (k, title) => d[k] ? `<section class="card"><h2 class="ctitle">${title}</h2><ul class="items"><li><div class="body"><span class="txt">${esc(d[k].t)}${scCor(k, d[k].c)}</span>${scCorNote(k, d[k].c)}${scRef(d[k].s)}</div></li></ul></section>` : "";
  const pdfHtml = tab === "sources" ? await scPdfRows(d) : ""; // guideline files this card cites (shared with the other card types)
  const srcList = (d.sources || []).map(s => `<li><div class="body"><span class="txt"><b>${esc(s.id)}</b> — ${esc(s.title)}${s.url ? ` · <a class="ref" href="${esc(s.url)}" target="_blank" rel="noopener">open online</a>` : ""}</span></div></li>`).join("");
  const tabs = [["scale", "Score"], ["interp", "Interpretation"], ["formulas", "Formulas"], ["sources", "Sources"]];
  tab = tabs.some(x => x[0] === tab) ? tab : "scale";
  const body = { scale: `<div id="sc-top" class="sctop">${scTop(d)}</div>`,
    interp: `<div id="sc-mini" class="sctop mini">${scTotal(d)}</div><section class="card" id="sc-interp">${scInterp(d)}</section>${notes}${extra("sofa_cns", "SOFA CNS points")}${extra("tbi_goals", "TBI goals")}`,
    formulas: `<section class="card"><h2 class="ctitle">Formulas</h2><div class="fms">${d.formulas.map(fm).join("")}</div></section>`,
    sources: `<section class="card"><h2 class="ctitle">Sources</h2><ul class="items">${srcList}</ul></section>
      ${pdfHtml}` }[tab];
  app.innerHTML = `
  <header class="top"><div class="bar"><button class="iconbtn" aria-label="Back to scales and calculations" data-go="#/scores">${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(d.short)}</h1><span class="badge ${popClass(d.population)}">${esc(popName(d.population))}</span><span class="badge rng" title="Score range">${r[0]}–${r[1]}</span></div>
      <div class="sub wrap">${esc(d.title)} · ${esc(d.age_range)}</div></div></div></header>
  <main class="fade scorepage"><p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}. ${esc(d.dagger_note)}</p>
    ${body}</main>
  <nav class="tabs">${tabs.map(([t, l]) => `<button data-go="#/score/${id}/${t}" class="${tab === t ? "on" : ""}" ${tab === t ? 'aria-current="page"' : ""}>${ico(t)}${l}</button>`).join("")}</nav>`;
  calcRefresh(); scUpdate();
}

/* ---------- calculator + range cards (index type "calculator" / "range"; first examples: blood gas) ---------- */
const TYPE_LABEL = { scale: "Scale", score: "Score", grade: "Grade", calculator: "Calculator", range: "Causes", dose: "Dose" };
const LV_COL = { amber: "#b7791f", orange: "#c2410c", red: "#b91c1c", purple: "#6d28d9" };
const CAUSE_NAMES = { HAGMA: "High-AG metabolic acidosis", NAGMA: "Normal-AG metabolic acidosis", OG: "Raised osmolar gap", RAc: "Respiratory acidosis", RAl: "Respiratory alkalosis", MAl: "Metabolic alkalosis" };
const BG_IN = [["ph", "pH", "", 1], ["pco2", "pCO₂", "", 1], ["hco3", "HCO₃⁻", "mmol/L", 1], ["na", "Na⁺", "mmol/L"], ["k", "K⁺", "mmol/L"], ["cl", "Cl⁻", "mmol/L"],
  ["albumin", "Albumin", "g/L"], ["glucose", "Glucose", "mmol/L"], ["urea", "Urea", "mmol/L"], ["osm", "Measured osm", "mOsm/kg"]];
const BG_FORMULA = { MAc: "winters", MAl: "met_alk_pco2", RAc: "resp_acidosis_hco3", RAl: "resp_alkalosis_hco3" };

function srcCheck(d) { // every cited source id must exist in sources.json
  const bad = [], seen = new Set();
  (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if ((k === "s" || k.startsWith("s_")) && typeof v === "string") seen.add(v); else walk(v); } })(d);
  (d.sources || []).forEach(x => seen.add(x.id));
  [...seen].forEach(s => { const id = s.split(":")[0]; if (!S.sources[id]) bad.push(`source "${id}" (from "${s}") is not in sources.json`); });
  return bad;
}
function cardValidate(d) { // console warnings only
  const bad = srcCheck(d);
  if (d.type === "calculator") {
    const keys = new Set(d.primary.map(p => p.key));
    d.compensation.forEach(c => { if (!keys.has(c.for)) bad.push(`compensation.for "${c.for}" matches no primary key`); });
    const b = d.delta_bands;
    if (b[0].min !== null) bad.push("first delta band should be open-ended below (min null)");
    if (b[b.length - 1].max !== null) bad.push("last delta band should be open-ended above (max null)");
    for (let i = 0; i < b.length - 1; i++) if (b[i].max !== b[i + 1].min) bad.push(`delta bands ${i} and ${i + 1} are not contiguous (${b[i].max} vs ${b[i + 1].min})`);
    d.formulas.forEach(f => { if (!REG[f.id]) bad.push(`formula "${f.id}" has no function in the calculator registry (calc.js)`); });
  } else if (d.type === "range") {
    const seen = new Set(); d.causes.forEach(c => { if (seen.has(c.key)) bad.push(`duplicate cause key ${c.key}`); seen.add(c.key); });
  }
  if (bad.length) console.warn(`Card ${d.id}:\n - ` + bad.join("\n - "));
}
function bgState(id, d) {
  if (!S.sc || S.sc.id !== id) { S.sc = { id, d, sel: {}, vt: false, age: "child", vars: {}, cor: new Set(), sample: "ABG", unit: "mmHg", chron: "unknown", open: new Set() }; cardValidate(d); }
  S.sc.d = d;
}
const bgNum = k => { const s = String(S.sc.vars[k] ?? "").trim(); return s === "" ? NaN : Number(s); };
function bgVals() { const v = {}; for (const [k] of BG_IN) v[k] = bgNum(k); if (S.sc.unit === "kPa") v.pco2 *= KPA_TO_MMHG; v.chron = S.sc.chron; return v; }

const cardHeader = (d, badge) => { const r = d.formulas?.[0]?.range;
  return `<header class="top"><div class="bar"><button class="iconbtn" aria-label="Back to scales and calculations" data-go="#/scores">${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(d.short)}</h1><span class="badge ${popClass(d.population)}">${esc(popName(d.population))}</span><span class="badge rng">${esc(badge)}</span></div>
      <div class="sub wrap">${esc(d.title)} · ${esc(d.age_range)}</div></div></div>{{extra}}</header>`; };
const cardHint = d => `<p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}. ${esc(d.dagger_note)}</p>`;
const scSrcList = d => `<section class="card"><h2 class="ctitle">Sources</h2><ul class="items">${(d.sources || []).map(s => { const g = S.sources[s.id] || {};
  return `<li><div class="body"><span class="txt"><b>${esc(s.id)}</b> — ${esc(s.title)}${s.url ? ` · <a class="ref" href="${esc(s.url)}" target="_blank" rel="noopener">open online</a>` : ""}</span>
    ${g.licence && !s.title.includes(g.licence) ? `<span class="lic">Licence: ${g.licence_url ? `<a class="ref" href="${esc(g.licence_url)}" target="_blank" rel="noopener">${esc(g.licence)}</a>` : esc(g.licence)}</span>` : g.licence ? `<span class="lic">Licence: ${esc(g.licence)}</span>` : ""}
    ${g.accessed ? `<span class="lic">Accessed ${esc(g.accessed)}</span>` : ""}</div></li>`; }).join("")}</ul></section>`;
async function scPdfRows(d) { // Load / offset controls for each STG chapter this card cites (same markup as a pathway's Sources tab)
  const cited = new Set(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if ((k === "s" || k.startsWith("s_")) && typeof v === "string") { const r = resolveSrc(v); if (r.chapter || (r.num && !r.online)) cited.add(v); } else walk(v); } })(d); // chaptered STGs, or a whole-book PDF cited by page (e.g. MAT24:130)
  const units = new Map(); [...cited].forEach(c => { const x = resolveSrc(c); const k = x.doc || x.pdf; if (!units.has(k)) units.set(k, x); });
  const rows = await Promise.all([...units].map(async ([key, x]) => { if (x.doc) return docRowsHtml([x.doc]); const has = await getPdf(key);
    return `<div class="srow"><div class="t">${esc(x.s.short)}${x.chapter ? " — " + esc(x.s.chapters[x.chapter]?.title || "Chapter " + x.chapter) : ""}</div><div class="e">${esc(x.s.edition || "")}</div>
      <div class="acts"><span class="status ${has ? "ok" : "no"}">${has ? "PDF on this phone" : "No PDF loaded"}</span>
      <label class="btn primary">${has ? "Replace PDF" : "Load PDF"}<input type="file" accept="application/pdf" data-load="${key}" hidden></label>${has ? `<button class="btn" data-del="${key}">Remove</button>` : ""}</div>
      <div class="acts off"><label>Page offset <input type="number" inputmode="numeric" value="${x.offset}" data-off="${key}"></label><span class="hint">PDF page minus printed page</span></div></div>`; }));
  return rows.length ? `<h2 class="glabel">Guideline PDFs</h2><p class="hint">Stored only on this phone so refs open offline. Chapter page offsets may need calibrating once per chapter.</p>${rows.join("")}` : "";
}
const scBandRow = (b, txt, on = true) => `<li class="band lvl-${b.level} ${on ? "on" : ""}"><span class="rng"></span><div class="body"><span class="txt">${txt}${scDag(b.d)}</span>${scRef(b.s)}</div></li>`;

/* --- calculator card --- */
function bgResults() {
  const d = S.sc.d, v = bgVals(), r = analyse(v, d), P = Object.fromEntries(d.primary.map(p => [p.key, p])), F = Object.fromEntries(d.formulas.map(f => [f.id, f]));
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1), f2 = x => x.toFixed(2), pc = x => `${f1(x)} mmHg (${f1(x / KPA_TO_MMHG)} kPa)`;
  const fd = id => ({ expr: F[id]?.expr, s: F[id]?.s, d: F[id]?.d, c: F[id]?.c });
  const row = (id, label, val, det = {}, col = "") => { const open = S.sc.open.has(id);
    return `<div class="res" ${col ? `style="--c:${col}"` : ""}><button class="rh" data-bgopen="${id}" aria-expanded="${open}"><span class="rl">${label}</span><span class="rv">${val}</span>${scDag(det.d)}${det.c ? '<span class="dag cor2">‡</span>' : ""}</button>
      ${open ? `<div class="rd">${det.expr ? `<div class="fx">${esc(det.expr)}</div>` : ""}${det.hint ? `<div class="hint2">${esc(det.hint)}</div>` : ""}${det.c ? `<div class="cnote">${esc(det.c)}</div>` : ""}${scRef(det.s)}</div>` : ""}</div>`; };
  const any = Object.values(v).some(x => Number.isFinite(x)), rows = [];
  if (S.sc.sample === "VBG") rows.push(`<div class="vbg"><b>VBG:</b> ${d.ranges.filter(x => ["pH", "pCO₂", "HCO₃⁻", "pO₂"].includes(x.param)).map(x => `${esc(x.param)} ${esc(x.vbg)}`).join(" · ")}. pCO₂ unreliable if &gt;45 mmHg; no oxygenation information. Values are not corrected.${scRef("LITFL-VBG")}</div>`);
  if (!any) { rows.push(`<p class="hint">Enter pH, pCO₂ and HCO₃⁻ to start. Everything else is optional.</p>`); return rows.join(""); }
  if (Number.isFinite(v.ph) && (v.ph < 6.5 || v.ph > 8)) rows.push(`<div class="vbg bad">pH ${esc(String(v.ph))} is outside 6.5–8.0: check the entry.</div>`);
  // a) pH
  if (r.phState) rows.push(row("ph", "pH", `<b>${r.phState === "acidaemia" ? "Acidaemia" : r.phState === "alkalaemia" ? "Alkalaemia" : "Normal pH"}</b> (${f2(v.ph)})`, { expr: d.steps[0].t, d: d.steps[0].d }));
  // b) primary
  if (!r.core) rows.push(row("prim", "Primary disorder", `<span class="muted">Enter ${["ph", "pco2", "hco3"].filter(k => !Number.isFinite(v[k])).map(k => ({ ph: "pH", pco2: "pCO₂", hco3: "HCO₃⁻" })[k]).join(", ")}</span>`));
  else if (r.primaries.length) {
    const ch = r.primaries.map(k => `<span class="pchip" style="background:${P[k].col}">${esc(P[k].name)}</span>`).join(" ");
    rows.push(row("prim", "Primary disorder", r.mixed ? `<b>Mixed respiratory + metabolic</b> ${ch}` : ch, { expr: r.primaries.map(k => P[k].crit).join(" · "), s: P[r.primaries[0]].s, d: P[r.primaries[0]].d }, P[r.primaries[0]].col));
  } else if (r.compensatedOrMixed) rows.push(row("prim", "Primary disorder", `<b>Compensated or mixed — check clinically</b><br><small>pH normal but pCO₂ ${f1(v.pco2)} mmHg / HCO₃⁻ ${f1(v.hco3)} mmol/L outside 35–45 / 22–26</small>`));
  else if (r.phState === "normal") rows.push(row("prim", "Primary disorder", `No acid–base disorder by these criteria`));
  else rows.push(row("prim", "Primary disorder", `<b>pH abnormal but pCO₂ and HCO₃⁻ meet no primary criterion</b> — recheck the values`));
  if (r.core) rows.push(`<div class="hint2 ph">pCO₂ entered: ${pc(v.pco2)}</div>`);
  // c) compensation
  if (r.mixed) rows.push(`<div class="hint2">Compensation is not assessed when two primary disorders are present.</div>`);
  r.comp.forEach(c => { const def = d.compensation.find(x => x.for === c.for), fid = BG_FORMULA[c.for], isMet = c.for === "MAc" || c.for === "MAl";
    const val = isMet ? `Expected pCO₂ <b>${f1(c.exp)}</b> (${f1(c.lo)}–${f1(c.hi)}) mmHg; measured ${pc(v.pco2)} → <b>${esc(c.text)}</b>`
      : `Expected HCO₃⁻ acute <b>${f1(c.acute)}</b> · chronic <b>${f1(c.chronic)}</b> mmol/L; measured ${f1(v.hco3)}${v.chron !== "unknown" ? ` (${v.chron} selected, ±2)` : ""} → <b>${esc(c.text)}</b>`;
    rows.push(row("comp" + c.for, "Compensation", val, { ...fd(fid), hint: def?.hint }, P[c.for].col)); });
  // d) anion gap
  if (r.ag !== undefined) {
    rows.push(row("ag", "Anion gap", `<b>${f1(r.ag)}</b> mmol/L ${r.agHigh ? '<b class="bad">high (>16)</b>' : "not high (≤16)"}`, fd("anion_gap")));
    if (r.agCorr !== undefined) rows.push(row("agc", "AG corrected for albumin", `<b>${f1(r.agCorr)}</b> mmol/L ${r.agCorrHigh ? '<b class="bad">high (>16)</b>' : "not high (≤16)"}`, fd("ag_albumin_corrected")));
  }
  // e) delta ratio
  if (r.delta !== undefined) { const bnd = d.delta_bands[r.deltaIdx];
    rows.push(row("delta", "Delta ratio", `<b>${f2(r.delta)}</b>${bnd ? ` → <b>${esc(bnd.t)}</b> (${esc(bnd.label)})` : ""}${r.agCorr !== undefined ? '<br><small>using albumin-corrected AG</small>' : ""}`, { ...fd("delta_ratio"), s: bnd?.s || F.delta_ratio?.s }, bnd ? LV_COL[bnd.level] : "")); }
  // f) K, g) Na
  if (r.kCorr !== undefined) rows.push(row("k", "K⁺ corrected for pH", `<b>${f1(r.kCorr)}</b> mmol/L <small>(measured ${f1(v.k)})</small>`, fd("k_corrected_ph")));
  if (r.naCorr !== undefined) rows.push(row("na", "Na⁺ corrected for glucose", `<b>${f1(r.naCorr)}</b> mmol/L <small>(measured ${f1(v.na)})</small><br><small>LITFL: ${f1(r.naCorrLitfl)} mmol/L ${scDag(true)} (Na + 1.6 × (glucose − 5.6)/5.6)</small>`, fd("na_corrected_glucose")));
  // h) osmolarity
  if (r.osmCalc !== undefined) rows.push(row("osm", "Calculated osmolarity", `<b>${f1(r.osmCalc)}</b> mOsm/L`, fd("osmolarity_calc")));
  if (r.og !== undefined) rows.push(row("og", "Osmolar gap", `<b>${f1(r.og)}</b> mOsm ${r.ogHigh ? '<b class="bad">raised (>10)</b>' : "not raised (≤10)"}`, fd("osmolar_gap"), r.ogHigh ? LV_COL.purple : ""));
  // i) STG bands
  const stg = d.interpretation_stg || [];
  if (stg.length) rows.push(`<section class="card"><h2 class="ctitle">SA STG <span class="cs2">${r.stg.length ? r.stg.length + " triggered" : "none triggered"}</span></h2><ul class="items bands">${stg.map((b, k) =>
    `<li class="band lvl-${b.level} ${r.stg.includes(k) ? "on" : ""}"><span class="rng">${r.stg.includes(k) ? "●" : ""}</span><div class="body"><span class="txt">${esc(b.t)}</span>${scRef(b.s)}</div></li>`).join("")}</ul></section>`);
  // cross-links
  const link = (S.index.scores || []).some(x => x.id === "bloodgas-causes") ? [...new Set(r.causes)] : [];
  if (link.length) rows.push(`<div class="xl"><span>See causes →</span>${link.map(k => `<button class="btn" data-go="#/score/bloodgas-interpretation/differentials/${k}">${esc(CAUSE_NAMES[k] || k)}</button>`).join("")}</div>`);
  if (r.primaries.includes("MAc") && r.agUsed === undefined) rows.push(`<div class="hint2">Enter Na⁺ and Cl⁻ to get the anion gap and choose between high- and normal-AG causes.</div>`);
  return rows.join("");
}
function bgAnalyse(d) {
  const seg = (k, opts, label) => `<div class="cgrp"><span class="cl2">${label}</span><div class="seg2" role="group" aria-label="${label}">${opts.map(([val, l]) => `<button data-bgopt="${k}|${val}" aria-pressed="${S.sc[k] === val}">${l}</button>`).join("")}</div></div>`;
  const f = ([k, lab, unit, req]) => `<label class="bgf">${lab}${req ? " *" : ""}<span class="inp"><input type="number" inputmode="decimal" step="any" data-bg="${k}" value="${esc(S.sc.vars[k] ?? "")}" autocomplete="off"><em>${k === "pco2" ? S.sc.unit : unit}</em></span></label>`;
  return `<div class="sctl bgctl">${seg("sample", [["ABG", "ABG"], ["VBG", "VBG"]], "Sample")}${seg("unit", [["mmHg", "mmHg"], ["kPa", "kPa"]], "pCO₂ unit")}<div class="cgrp"><span class="cl2">Values</span><button class="btn clrall" data-bgclear>Clear all fields</button></div></div>
    <section class="card bgin"><h2 class="ctitle">Blood gas <span class="cs2">* required</span></h2><div class="bggrid">${BG_IN.slice(0, 3).map(f).join("")}</div>
      <h3 class="dsub">Optional</h3><div class="bggrid">${BG_IN.slice(3).map(f).join("")}</div></section>
    <div id="bg-out" class="bgout" aria-live="polite">${bgResults()}</div>`;
}
const bgFormulas = d => `<section class="card"><h2 class="ctitle">Formulas <span class="cs2">${d.formulas.length} · tap ‡ for notes</span></h2><div class="fms">${d.formulas.map(f => `<div class="fm"><div class="fh"><b>${esc(f.name)}</b>${scDag(f.d)}${scCor("f-" + f.id, f.c)}${scRef(f.s)}${f.card === false ? '<span class="hid">not on the PDF card</span>' : ""}</div>
  <div class="fx">${esc(f.expr)}</div>${scCorNote("f-" + f.id, f.c)}<div class="fmeta">${[f.units, f.normal ? "Normal " + f.normal : "", f.notes].filter(Boolean).map(esc).join(" · ")}</div></div>`).join("")}</div></section>`;
async function bgReference(d) {
  const comp = k => d.compensation.filter(c => c.for === k).map(c => `<div class="pcomp">${esc(c.t)}${scDag(c.d)}${c.hint ? `<small>${esc(c.hint)}</small>` : ""}</div>`).join("");
  const stg = (d.interpretation_stg || []).map(b => scBandRow(b, esc(b.t))).join("");
  return `<section class="card"><h2 class="ctitle">Steps</h2><ol class="steps2">${d.steps.map(s => `<li><span class="n">${s.n}</span><span>${esc(s.t)}${scDag(s.d)}</span></li>`).join("")}</ol></section>
    <h2 class="glabel">Primary disorders and compensation</h2><div class="ptiles">${d.primary.map(p => `<div class="ptile" style="--c:${p.col}"><h3>${esc(p.name)}</h3><div class="pcrit">${esc(p.crit)}${scDag(p.d)}</div>${comp(p.key)}${scRef(p.s)}</div>`).join("")}</div>
    <h2 class="glabel">Delta ratio</h2><div class="dstrip">${d.delta_bands.map(b => `<div style="--c:${LV_COL[b.level]}"><b>${esc(b.label)}</b><span>${esc(b.t)}${scDag(b.d)}</span></div>`).join("")}</div>
    <section class="card"><h2 class="ctitle">Normal ranges</h2><div class="tscroll"><table class="dtab"><thead><tr><th>Parameter</th><th>ABG</th><th>VBG</th></tr></thead><tbody>${d.ranges.map(x =>
      `<tr><th>${esc(x.param)}${scDag(x.d)}${scRef(x.s)}</th><td>${esc(x.abg)}</td><td>${esc(x.vbg)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><h2 class="ctitle">Chemistry</h2><ul class="items">${d.chem.map(x => `<li><div class="body"><span class="txt"><b>${esc(x.param)}</b> ${esc(x.range)} ${esc(x.units)}${x.note ? ` · ${esc(x.note)}` : ""}${scDag(x.d)}</span>${scRef(x.s)}</div></li>`).join("")}</ul></section>
    ${stg ? `<section class="card"><h2 class="ctitle">SA STG</h2><ul class="items bands">${stg}</ul></section>` : ""}
    ${(d.notes || []).length ? `<section class="card"><h2 class="ctitle">Notes</h2><ul class="items">${d.notes.map(n => `<li><div class="body"><span class="txt">${esc(n.t)}${scDag(n.d)}</span>${scRef(n.s)}</div></li>`).join("")}</ul></section>` : ""}
    ${scSrcList(d)}${await scPdfRows(d)}`;
}
async function calcView(id, d, tab, key) {
  bgState(id, d);
  const tabs = [["analyse", "Analyse"], ["formulas", "Formulas"], ["ref", "Reference"], ["differentials", "Differentials"]];
  tab = tabs.some(x => x[0] === tab) ? tab : "analyse";
  let cd = null, ce = (S.index.scores || []).find(x => x.id === "bloodgas-causes");
  if (tab === "differentials" && ce) cd = S.sd[ce.id] ||= await loadJSON("data/" + ce.file);
  const body = tab === "analyse" ? bgAnalyse(d) : tab === "formulas" ? bgFormulas(d) : tab === "differentials" ? (cd ? causeSearch + causesBody(cd) : `<p class="empty">Causes data not available.</p>`) : await bgReference(d);
  app.innerHTML = cardHeader(d, TYPE_LABEL[d.type]).replace("{{extra}}", "") + `<main class="fade scorepage ${tab === "differentials" ? "causes" : ""}">${cardHint(d)}${body}</main>
  <nav class="tabs">${tabs.map(([t, l]) => `<button data-go="#/score/${id}/${t}" class="${tab === t ? "on" : ""}" ${tab === t ? 'aria-current="page"' : ""}>${ico(t)}${l}</button>`).join("")}</nav>`;
  if (tab === "differentials") causeFlash(key);
}

/* --- range / causes card --- */
function causeFilter() {
  const q = ($("#cq")?.value || "").trim().toLowerCase(), ws = q ? q.split(/\s+/) : []; let any = 0;
  $$(".cbox").forEach(b => { const whole = ws.length && ws.every(w => b.dataset.q.includes(w)); let n = 0;
    $$(".cg", b).forEach(g => { let m = 0; $$("li", g).forEach(li => { const ok = !ws.length || whole || ws.every(w => li.dataset.q.includes(w)); li.hidden = !ok; if (ok) m++; }); g.hidden = !m; n += m; });
    b.hidden = !n; any += n; });
  $("#cnone").hidden = !!any;
}
function causesBody(d) {
  const box = c => `<section class="cbox" id="cause-${esc(c.key)}" style="--c:${c.col}" data-q="${esc((c.name + " " + c.sub + " " + c.key).toLowerCase())}"><h2><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></h2>
    <div class="cb">${c.groups.map(g => `<div class="cg">${g.h ? `<h3>${esc(g.h)}</h3>` : ""}<ul>${g.items.map(it => `<li data-q="${esc((it.t + " " + (g.h || "")).toLowerCase())}">${it.k ? `<b class="k">${esc(it.t.charAt(0))}</b>${esc(it.t.slice(1))}` : esc(it.t)}</li>`).join("")}</ul></div>`).join("")}</div>
    <div class="cf">${scDag(c.d)}${scRef(c.s)}</div></section>`;
  const stg = (d.interpretation_stg || []).length ? `<section class="card"><h2 class="ctitle">SA STG</h2><ul class="items">${d.interpretation_stg.map(b => `<li><div class="body"><span class="txt">${esc(b.t)}</span>${scRef(b.s)}</div></li>`).join("")}</ul></section>` : "";
  const notes = (d.notes || []).length ? `<section class="card"><h2 class="ctitle">Notes</h2><ul class="items">${d.notes.map(n => `<li><div class="body"><span class="txt">${esc(n.t)}${scDag(n.d)}</span>${scRef(n.s)}</div></li>`).join("")}</ul></section>` : "";
  return `<div class="cgrid">${d.causes.map(box).join("")}</div><p class="empty" id="cnone" hidden>No cause matches.</p>${stg}${notes}`;
}
const causeSearch = `<div class="qrow"><label class="search">${ico("search")}<span class="sr">Search causes</span><input id="cq" type="search" placeholder="Search causes — e.g. metformin, USED CRAP" autocomplete="off"></label></div>`;
const causeFlash = key => { const t = key && $("#cause-" + CSS.escape(key)); if (t) { t.scrollIntoView({ block: "start" }); t.classList.add("flash"); } };
async function rangeView(id, d, key) {
  bgState(id, d);
  app.innerHTML = cardHeader(d, TYPE_LABEL[d.type]).replace("{{extra}}", causeSearch) + `<main class="fade scorepage causes">${cardHint(d)}${causesBody(d)}${scSrcList(d)}${await scPdfRows(d)}</main>`;
  causeFlash(key);
}

/* ---------- checklist score cards: versions[] + components[].points (Wells PE, Wells DVT) ---------- */
const SA_SRC = /^(HOSP|MAT24|PHC|PAED)(:|$)/; // SA guideline ids: only these get a green ✚ inline; every other source is listed in the footer
const plus = s => s && SA_SRC.test(s) ? `<button class="plus" data-src="${esc(s)}" aria-label="Open ${esc(s.replace(":", " "))} in the guideline">✚</button>` : "";
const fmtG = n => String(+Number(n).toFixed(2)); // 1.5 -> "1.5", 2 -> "2"
const sgn = n => (n < 0 ? "−" : "") + fmtG(Math.abs(n));
const wRange = (a, b) => a === b ? sgn(a) : `${sgn(a)}–${sgn(b)}`;
const verLabel = k => k.charAt(0).toUpperCase() + k.slice(1);

function wUpdate() {
  const d = S.sc.d, it = interpretCard(d, S.sc.ver, scoreCard(d, S.sc.ver, S.sc.ticked).total);
  if (S.sc.lastLikely !== it.likely) { S.sc.nsFlip = new Set(); S.sc.lastLikely = it.likely; } // a new likely/unlikely call re-opens the matching block
  $("#w-top").innerHTML = wTop(d); $("#w-interp").innerHTML = wInterp(d); $("#w-next").innerHTML = wNext(d);
  const p = $("#w-perc"); if (p) p.innerHTML = wPerc(d);
  wDdimer();
}
function wTop(d) {
  const v = S.sc.ver, m = scoreCard(d, v, S.sc.ticked), it = interpretCard(d, v, m.total), others = d.versions.filter(x => x.key !== v);
  const sw = `<div class="seg2 wver" role="group" aria-label="Score version">${d.versions.map(x => `<button data-wver="${esc(x.key)}" aria-pressed="${x.key === v}">${esc(x.name)}</button>`).join("")}</div>`;
  const rows = d.components.map(c => { const p = c.points[v], na = p == null, on = !na && S.sc.ticked.has(c.key);
    return `<div class="crit ${p < 0 ? "neg" : ""} ${on ? "on" : ""} ${na ? "na" : ""}"><button class="ck" data-wtick="${esc(c.key)}" aria-pressed="${on}" ${na ? "disabled" : ""}><span class="box" aria-hidden="true">${on ? "✓" : ""}</span><span class="ct">${esc(c.t)}</span></button>
      ${plus(c.s)}<span class="cp"><b>${na ? "—" : (p > 0 ? "+" : "") + sgn(p)}</b>${others.map(o => `<small>${esc(verLabel(o.key))} ${c.points[o.key] == null ? "—" : (c.points[o.key] > 0 ? "+" : "") + sgn(c.points[o.key])}</small>`).join("")}</span></div>`; }).join("");
  const chips = it.schemes.map(x => x.band ? `<span class="lvl lvl-${x.band.level}">${esc(x.band.label)}</span>` : "").join("");
  return `${sw}<section class="card"><h2 class="ctitle">Criteria <span class="cs2">${esc(d.versions.find(x => x.key === v).name)}</span></h2>${rows}</section>
    <div class="wtotal" aria-live="polite"><div class="wl">Total</div><div class="wv"><b>${sgn(m.total)}</b><span> / ${sgn(m.min)}–${fmtG(m.max)}</span></div>
      <div class="tsub">${chips}<button class="clr" data-wreset>Reset</button></div></div>`;
}
function wInterp(d) {
  const v = S.sc.ver, total = scoreCard(d, v, S.sc.ticked).total, it = interpretCard(d, v, total);
  return `<h2 class="ctitle">Interpretation <span class="cs2">score ${sgn(total)}</span></h2>` + it.schemes.map(x => `<div class="wsch"><div class="wst">${esc(x.scheme)}${plus(x.s)}</div>
    <div class="wchips">${x.bands.map(b => `<div class="wchip lvl-${b.level} ${b === x.band ? "on" : ""}"><b>${esc(b.label)}</b>${b.risk ? `<small>${esc(b.risk)}</small>` : ""}<span>${wRange(b.min, b.max)}</span></div>`).join("")}</div></div>`).join("");
}
function wNext(d) {
  const it = interpretCard(d, S.sc.ver, scoreCard(d, S.sc.ver, S.sc.ticked).total);
  const basis = it.likely === null ? "" : `<p class="hint">${it.likely ? "Likely" : "Unlikely"} — from the ${esc(it.basis)} scheme${it.mapped ? " (mapped from three-tier: High = likely; Low/Moderate = unlikely)" : ""}.</p>`;
  return `<h2 class="glabel">Next steps</h2>${basis}` + d.next_steps.map(n => { const match = it.likely !== null && (n.level === "red") === it.likely, open = match !== S.sc.nsFlip.has(n.level);
    return `<section class="card ${n.level === "red" ? "red" : "green"} ${open ? "" : "closed"}"><h2><button class="shead" data-wns="${esc(n.level)}" aria-expanded="${open}"><span class="st">${esc(n.if)}${match && it.mapped ? " (mapped from three-tier)" : ""}${plus(n.s)}</span>${match ? '<span class="cnt all">this score</span>' : ""}${ico("down")}</button></h2>
      <ul class="items">${n.steps.map((t, i) => `<li><span class="stn">${i + 1}</span><div class="body"><span class="txt">${esc(t)}</span></div></li>`).join("")}</ul></section>`; }).join("");
}
function wPerc(d) {
  const p = d.perc, any = S.sc.perc.size > 0;
  return `<button class="btn wpbtn" data-wpercopen aria-expanded="${S.sc.percOpen}">Low clinical suspicion (gestalt &lt;15%) — PERC ${ico("down")}</button>` + (S.sc.percOpen ? `<section class="card"><h2 class="ctitle">PERC rule${plus(p.s)}</h2><p class="hint" style="padding:8px 14px 0">${esc(p.when)}</p>
    <ul class="items">${p.items.map((t, i) => `<li class="${S.sc.perc.has(String(i)) ? "checked" : ""}"><button class="chk ${S.sc.perc.has(String(i)) ? "on" : ""}" data-wperc="${i}" aria-pressed="${S.sc.perc.has(String(i))}" aria-label="${esc(t)}"></button><div class="body"><span class="txt">${esc(t)}</span></div></li>`).join("")}</ul>
    <div class="percres ${any ? "amber" : "green"}">${any ? "PERC cannot be applied — use Wells" : "PERC negative: PE excluded — no further testing"}</div></section>` : "");
}
function wDdimer() {
  const o = $("#w-ddout"); if (!o) return;
  const raw = String(S.sc.age ?? "").trim(), age = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(age)) o.innerHTML = `<span class="muted">Enter the patient's age</span>`;
  else if (age < 0 || age > 120) o.innerHTML = `<span class="bad">Age should be 0–120 years</span>`;
  else { const c = REG.ddimer_age_adjusted({ age }); o.innerHTML = c === null ? `Age ≤50: use the <b>standard cut-off (500 µg/L FEU)</b>` : `Age &gt;50: cut-off = ${fmtG(age)} × 10 = <b class="cv">${fmtG(c)}</b> µg/L FEU`; }
}
async function checkView(id, e, d) {
  if (!S.sc || S.sc.id !== id) { // fresh card: nothing carries over between patients, nothing is stored
    const bad = [...validateScoreCard(d), ...srcCheck(d)]; if (bad.length) console.warn(`Score card ${d.id}:\n - ` + bad.join("\n - "));
    S.sc = { id, d, sel: {}, cor: new Set(), vars: {}, ver: (d.versions.find(x => x.key === "modified") || d.versions[0]).key, ticked: new Set(), perc: new Set(), percOpen: false, age: "", nsFlip: new Set(), lastLikely: undefined }; }
  S.sc.d = d;
  const dd = d.formulas.find(f => f.id === "ddimer_age_adjusted");
  const sec = (title, inner) => inner ? `<section class="card"><h2 class="ctitle">${title}</h2>${inner}</section>` : "";
  const stg = (d.interpretation_stg || []).length ? sec("SA guidelines", `<ul class="items bands">${d.interpretation_stg.map(b => `<li class="band lvl-${b.level} on"><div class="body"><span class="txt">${esc(b.t)}${plus(b.s)}</span></div></li>`).join("")}</ul>`) : "";
  const notes = (d.notes || []).length ? sec("Pearls", `<ul class="items">${d.notes.map(n => `<li><div class="body"><span class="txt">${esc(n.t)}${plus(n.s)}</span></div></li>`).join("")}</ul>`) : "";
  app.innerHTML = cardHeader(d, TYPE_LABEL[d.type]).replace("{{extra}}", "") + `<main class="fade scorepage wells"><p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}</p>
    <div id="w-top" class="sctop">${wTop(d)}</div>
    <section class="card" id="w-interp">${wInterp(d)}</section>
    <div id="w-next" class="wnext">${wNext(d)}</div>
    ${d.perc ? `<div id="w-perc" class="wperc">${wPerc(d)}</div>` : ""}
    ${dd ? `<section class="card"><h2 class="ctitle">${esc(dd.name)}${plus(dd.s)}</h2><div class="fm"><div class="fx">${esc(dd.expr)}</div>${dd.notes ? `<div class="fmeta">${esc(dd.notes)}</div>` : ""}
      <div class="fin"><label>Age<span class="inp"><input type="number" inputmode="decimal" min="0" max="120" step="any" data-wage value="${esc(S.sc.age ?? "")}" autocomplete="off"><em>years</em></span></label></div><div class="fo" id="w-ddout"></div></div></section>` : ""}
    ${stg}${notes}
    <p class="hint">${esc(d.card_note)}</p>${e.pdf ? `<div class="toolrow" style="justify-content:flex-start;padding:0 4px"><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">Printable PDF</a></div>` : ""}
    ${scSrcList(d)}${await scPdfRows(d)}</main>`;
  wDdimer();
}

/* ---------- events ---------- */
const rerender = async () => { const y = window.scrollY; await route(); window.scrollTo(0, y); };
document.addEventListener("click", async e => {
  const t = e.target.closest("button, label, [data-closemenu]"); if (!t) return;
  if (t.dataset.closemenu !== undefined) { $(".menu")?.remove(); t.remove(); return; }
  if (t.closest(".menu")) { $(".menu")?.remove(); $(".scrim")?.remove(); }
  if (t.dataset.go !== undefined) { location.hash = t.dataset.go || "#/"; return; }
  if (t.dataset.src) { openSource(t.dataset.src); return; }
  if (t.id === "more") { const p = (location.hash || "").slice(2).split("/"); toggleMenu(await getDx(p[1])); return; }
  if (t.dataset.catfilter) { S.cat = t.dataset.catfilter; applyFilter(); return; }
  if (t.dataset.sysfilter) { S.sys = t.dataset.sysfilter; applyFilter(); return; }
  if (t.dataset.filter) { S.filter = t.dataset.filter; applyFilter(); return; }
  if (t.dataset.dxtoggle !== undefined) { const c = t.closest("section.dxc"); dxSet(c, c.classList.contains("closed")); dxAllLabel(); return; }
  if (t.dataset.dxall) { const v = $$("section.dxc").filter(c => !c.hidden), on = !v.every(c => !c.classList.contains("closed")); v.forEach(c => dxSet(c, on)); dxAllLabel(); return; }
  if (t.dataset.hubpop) { const [hid, i] = t.dataset.hubpop.split("|"); S.hub[hid] = +i; route(); return; }
  if (t.dataset.sec) {
    const n = +t.dataset.sec; const id = (location.hash || "").slice(2).split("/")[1]; const set = S.open[id];
    const sec = t.closest("section"); const closed = sec.classList.toggle("closed");
    closed ? set.delete(n) : set.add(n); t.setAttribute("aria-expanded", !closed); return;
  }
  if (t.dataset.jump) {
    const el = document.getElementById(t.dataset.jump); if (!el) return;
    if (el.classList.contains("closed")) { el.classList.remove("closed"); $(".shead", el)?.setAttribute("aria-expanded", "true");
      const id = (location.hash || "").slice(2).split("/")[1]; S.open[id]?.add(+t.dataset.jump.slice(1)); }
    el.scrollIntoView({ block: "start" }); return;
  }
  if (t.dataset.chain !== undefined) {
    const k = +t.dataset.chain, pid = (location.hash || "").slice(2).split("/")[1]; S.chain[pid] = k;
    $$(".chaintabs button").forEach(b => { const on = +b.dataset.chain === k; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $$(".chain").forEach(c => c.classList.toggle("on", +c.dataset.chainbox === k)); return;
  }
  if (t.dataset.wver) { S.sc.ver = t.dataset.wver; S.sc.nsFlip = new Set(); wUpdate(true); return; }
  if (t.dataset.wtick) { const k = t.dataset.wtick; S.sc.ticked.has(k) ? S.sc.ticked.delete(k) : S.sc.ticked.add(k); wUpdate(); return; }
  if (t.dataset.wperc !== undefined) { const k = t.dataset.wperc; S.sc.perc.has(k) ? S.sc.perc.delete(k) : S.sc.perc.add(k); wUpdate(); return; }
  if (t.dataset.wpercopen !== undefined) { S.sc.percOpen = !S.sc.percOpen; wUpdate(); return; }
  if (t.dataset.wns) { const f = S.sc.nsFlip, k = t.dataset.wns; f.has(k) ? f.delete(k) : f.add(k); wUpdate(); return; }
  if (t.dataset.wreset !== undefined) { S.sc.ticked = new Set(); S.sc.perc = new Set(); S.sc.percOpen = false; S.sc.nsFlip = new Set(); wUpdate(); return; }
  if (t.dataset.greset !== undefined) { S.sc.sel = {}; S.sc.tube = S.sc.vent = false; $$("[data-gair]").forEach(c => { c.checked = false; }); scUpdate(); return; }
  if (t.dataset.scclear !== undefined) { S.sc.sel = {}; scUpdate(); return; }
  if (t.dataset.cor) { const c = S.sc.cor; c.has(t.dataset.cor) ? c.delete(t.dataset.cor) : c.add(t.dataset.cor); S.sc.d.type === "scale" ? scUpdate() : rerender(); return; }
  if (t.dataset.bgclear !== undefined) { S.sc.vars = {}; S.sc.open.clear(); rerender(); return; }
  if (t.dataset.bgopen) { const o = S.sc.open; o.has(t.dataset.bgopen) ? o.delete(t.dataset.bgopen) : o.add(t.dataset.bgopen); $("#bg-out").innerHTML = bgResults(); return; }
  if (t.dataset.bgopt) { // calculator toggles: sample ABG|VBG, pCO2 unit, chronicity. A unit switch converts the number already typed.
    const [k, val] = t.dataset.bgopt.split("|");
    if (k === "unit" && val !== S.sc.unit) { const n = Number(S.sc.vars.pco2); if (String(S.sc.vars.pco2 ?? "").trim() !== "" && Number.isFinite(n)) S.sc.vars.pco2 = String(Math.round((val === "kPa" ? n / KPA_TO_MMHG : n * KPA_TO_MMHG) * 100) / 100); }
    S.sc[k] = val; rerender(); return; }
  if (t.dataset.spop !== undefined) { S.spop = t.dataset.spop; applyScoreFilter(); return; }
  if (t.dataset.stag !== undefined) { S.stag = t.dataset.stag; applyScoreFilter(); return; }
  if (t.dataset.seg) { S.seg = +t.dataset.seg; rerender(); return; }
  if (t.id === "vm") { S.verify = !S.verify; localStorage.setItem(LS_MODE, S.verify ? "1" : "0"); rerender(); return; }
  if (t.dataset.tick) {
    const k = t.dataset.tick; if (S.verified[k]) delete S.verified[k]; else S.verified[k] = new Date().toISOString().slice(0, 10);
    localStorage.setItem(LS_VER, JSON.stringify(S.verified)); rerender(); return;
  }
  if (t.dataset.chk) {
    const k = t.dataset.chk; if (S.checked[k]) delete S.checked[k]; else S.checked[k] = new Date().toISOString().slice(0, 10);
    localStorage.setItem(LS_CHK, JSON.stringify(S.checked)); rerender(); return;
  }
  if (t.dataset.resetchk) {
    if (!confirm("Clear all checklist ticks for this pathway?")) return;
    const dd = await getDx(t.dataset.resetchk);
    allItems(dd).forEach(it => delete S.checked[key(dd.id, it)]);
    localStorage.setItem(LS_CHK, JSON.stringify(S.checked)); rerender(); return;
  }
  if (t.dataset.del) { await delPdf(t.dataset.del); route(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "q") applyFilter();
  if (e.target.id === "wt" && S.procR) { S.procKg = e.target.value; $("#wout").innerHTML = weightCalc(S.procR, parseFloat(e.target.value)); }
  if (e.target.id === "hq") hubFilter();
  if (e.target.id === "dxq") dxFilter();
  if (e.target.id === "sq") applyScoreFilter();
  if (e.target.id === "cq") causeFilter();
  if (e.target.dataset.wage !== undefined) { S.sc.age = e.target.value; wDdimer(); }
  if (e.target.dataset.bg) { S.sc.vars[e.target.dataset.bg] = e.target.value; const o = $("#bg-out"); if (o) o.innerHTML = bgResults(); }
  if (e.target.dataset.var) { // calculator input: keep every field for the same variable in step, then recompute
    S.sc.vars[e.target.dataset.var] = e.target.value;
    $$(`input[data-var="${e.target.dataset.var}"]`).forEach(i => { if (i !== e.target) i.value = e.target.value; });
    calcRefresh();
  }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.load && t.files[0]) { await putPdf(t.dataset.load, t.files[0]); route(); }
  if (t.dataset.off !== undefined) { S.offsets[t.dataset.off] = parseInt(t.value || "0", 10); localStorage.setItem(LS_OFF, JSON.stringify(S.offsets)); }
});

function remember(id, tab, row) {
  S.recent = [{ id, tab, row }, ...S.recent.filter(r => r.id !== id)].slice(0, 3);
  localStorage.setItem(LS_REC, JSON.stringify(S.recent));
}
async function route() {
  $(".menu")?.remove(); $(".scrim")?.remove();
  const p = (location.hash || "#/").slice(2).split("/");
  try {
    if (p[0] === "") return landing();
    if (p[0] === "diagnoses") return home();
    if (p[0] === "hub") return hubView(p[1]);
    if (p[0] === "fluids") return fluidsHub();
    if (p[0] === "procedures") return procHome();
    if (p[0] === "proc") return procView(p[1], p[2]);
    if (p[0] === "scores") return scoresHome();
    if (p[0] === "score") return scoreView(p[1], p[2], p[3]);
    if (p[0] !== "dx") return landing();
    const d = await getDx(p[1]); const tab = ["days", "differentials", "doses", "nursing", "sources"].includes(p[2]) ? p[2] : "arrival";
    remember(d.id, tab, p[3]);
    const hb = entry(d.id)?.hub; if (hb) S.hub[hb] = ((S.index.hubs || []).find(h => h.id === hb)?.members || []).findIndex(m => m.id === d.id); // hub reopens on the population you were in
    if (tab === "days") return days(d, parseInt(p[3] || "0", 10));
    if (tab === "differentials" && (d.differentials || []).length) return differentials(d, p[3] === undefined ? undefined : parseInt(p[3], 10));
    if (tab === "doses") return doses(d);
    if (tab === "nursing") return nursing(d);
    if (tab === "sources") return sources(d);
    return arrival(d);
  } catch (err) { app.innerHTML = `<main><p class="hint">Could not load this page: ${esc(err.message)}. Open the app once with signal so it can save itself for offline use.</p><div class="toolrow"><button class="btn" data-go="#/">All pathways</button></div></main>`; }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!$(".viewer")) route(); }); // show "Saved" once the offline copy is ready
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
init();
