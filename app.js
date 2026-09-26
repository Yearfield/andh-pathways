// JAD Pathways — offline reference app. Data lives in data/*.json (one file per diagnosis).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("#app");
const LS_VER = "andh.verified", LS_OFF = "andh.offsets", LS_MODE = "andh.verifyMode", LS_CHK = "andh.checked", LS_REC = "andh.recent";
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const S = {
  index: null, sources: {}, dx: {}, verified: ls(LS_VER, {}), offsets: ls(LS_OFF, {}),
  verify: localStorage.getItem(LS_MODE) === "1", checked: ls(LS_CHK, {}), recent: ls(LS_REC, []),
  open: {}, seg: 0, filter: "All",
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
};
const ico = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

const popBase = p => String(p).replace(/\s*\(.*$/, ""); // "Adult (excludes …)" -> "Adult": the detail in brackets is not a group
const popClass = p => (p = popBase(p), /obstet/i.test(p) ? "pop-obstetric" : /\+/.test(p) ? "pop-tox" : /paed/i.test(p) ? "pop-paediatric" : "pop-adult");
const popName = p => (p = popBase(p), /\+/.test(p) ? "Adult + paeds" : p);

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
  (await loadJSON("data/sources.json")).sources.forEach(s => (S.sources[s.id] = s));
  window.addEventListener("hashchange", route); route();
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
function chip(src) {
  if (!src) return "";
  const [id, pg] = src.split(":"); const s = S.sources[id];
  const num = /^\d/.test(pg); // numeric = printed page; otherwise a recommendation number (e.g. ESGE R13)
  return `<button class="chip" data-src="${esc(src)}" aria-label="Open ${esc(s ? s.short : id)} ${num ? "page " : ""}${esc(pg)}">${esc(s ? s.short : id)} ${num ? "p" : ""}${esc(pg)}</button>`;
}
const dag = it => it.d ? '<span class="dag">†</span>' : "";
const tick = (k) => { const v = S.verified[k]; return S.verify ? `<button class="tick ${v ? "on" : ""}" data-tick="${k}" aria-pressed="${!!v}" aria-label="${v ? "Verified " + v : "Mark verified"}">✓</button>` : ""; };
function li(d, it) {
  if (it.h && !it.t) return `<li class="head"><span class="txt" style="flex:1">${esc(it.h)}${dag(it)}</span>${chip(it.s)}</li>`;
  const k = key(d.id, it); const cOn = S.checked[k];
  const cls = [it.k === "sub" ? "sub" : "", it.k === "info" ? "info" : "", it.k === "value" ? "value" : "", it.b ? "b" : "", it.k === "yn" ? "yn" : "", cOn ? "checked" : ""].join(" ");
  const chk = `<button class="chk ${cOn ? "on" : ""}" data-chk="${k}" aria-pressed="${!!cOn}" aria-label="${cOn ? "Checked off" : "Mark done"}"></button>`;
  return `<li class="${cls}">${chk}<div class="body"><span class="txt">${esc(it.t)}${dag(it)}</span>${chip(it.s)}</div>${tick(k)}</li>`;
}
const list = (d, items) => `<ul class="items">${(items || []).map(i => li(d, i)).join("")}</ul>`;
const card = (d, title, items, cls = "") => `<section class="card ${cls}"><h2 class="ctitle">${esc(title)}</h2>${list(d, items)}</section>`;

/* ---------- screens ---------- */
function shell({ d, tab, body, head = "", after = "", mainCls = "" }) {
  const [v, n] = d ? progress(d) : [0, 0];
  const e = d ? entry(d.id) || d : null;
  app.innerHTML = `
  <header class="top"><div class="bar">
    <button class="iconbtn" aria-label="Back to all pathways" data-go="#/">${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(e.short || d.title)}</h1><span class="badge ${popClass(e.population || d.population)}">${esc(popName(e.population || d.population))}</span></div>
      <div class="sub">${esc(d.title)}</div></div>
    <button class="iconbtn" id="more" aria-label="More: verify mode, reset checklist" aria-haspopup="true">${MORE}</button></div>
    ${S.verify ? `<div class="meter" title="${v} of ${n} verified"><i style="width:${n ? (100 * v / n) : 0}%"></i></div>` : ""}
    ${head}</header>
  <main class="fade ${mainCls}">${body}</main>${after}
  <nav class="tabs">${[["arrival", "Arrival"], ["days", "Timeline"], ["differentials", "Differentials"], ["doses", "Doses"], ["nursing", "Nursing"], ["sources", "Sources"]]
      .filter(([t]) => t !== "differentials" || (d.differentials || []).length).map(([t, l]) => `<button data-go="#/dx/${d.id}/${t}" class="${tab === t ? "on" : ""}" ${tab === t ? 'aria-current="page"' : ""}>${ico(t)}${l}</button>`).join("")}</nav>`;
}

function home() {
  const dx = S.index.diagnoses;
  const groups = [...new Set(dx.map(e => popName(e.population)))];
  const rec = S.recent.map(r => ({ ...r, e: entry(r.id) })).filter(r => r.e).slice(0, 3);
  const tabName = { arrival: "Arrival", days: "Timeline", differentials: "Differentials", doses: "Doses", nursing: "Nursing", sources: "Sources" };
  const recent = rec.length ? `<section id="recent"><h2 class="glabel">Recent</h2><div class="recent">${rec.map(r =>
    `<button class="rcard" data-go="#/dx/${r.id}/${r.tab}${r.tab === "days" && r.row ? "/" + r.row : ""}"><b>${esc(r.e.short)}</b><span>${esc(tabName[r.tab] || "")}</span></button>`).join("")}</div></section>` : "";
  const lists = groups.map(g => { const items = dx.filter(e => popName(e.population) === g);
    return `<section class="grp" data-grp="${esc(g)}"><h2 class="glabel"><span class="dot ${popClass(items[0].population)}"></span>${esc(g)}<span class="c">· <span class="gc">${items.length}</span></span></h2>
      <div class="list">${items.map(e => `<button class="dx" data-go="#/dx/${e.id}/arrival" data-q="${esc((e.short + " " + e.title + " " + e.population + " " + e.id).toLowerCase())}">
        <span class="t">${esc(e.short)}</span><span class="p">${esc(e.title)}</span>${ico("next")}</button>`).join("")}</div></section>`; }).join("");
  app.innerHTML = `
  <header class="top"><div class="hometop">
    <div class="brand"><img class="logo" src="icons/jad-logo.webp" alt="JAD">
      <div class="ttl"><h1>Pathways</h1><div class="sub">ANDH · ${dx.length} pathways · works offline</div></div>
      ${navigator.serviceWorker?.controller ? `<span class="pill-ok">${ico("check")}Saved</span>` : ""}</div>
    <label class="search">${ico("search")}<span class="sr">Search pathways</span>
      <input id="q" type="search" placeholder="Search — e.g. PPH, DKA, rat poison" autocomplete="off"></label>
    <div class="chips">${["All", ...groups].map(g => `<button class="fchip" data-filter="${esc(g)}" aria-pressed="${S.filter === g}">${esc(g)}</button>`).join("")}</div>
  </div></header>
  <main class="fade home">${recent}${lists}<p class="empty" id="none" hidden>No pathway matches.</p>
    <p class="hint">Reference only — no patient details are stored. Amber tags open the guideline page they come from. † = clinical or local addition, not in the SA guideline.</p></main>`;
  applyFilter();
}
function applyFilter() {
  const q = ($("#q")?.value || "").trim().toLowerCase(); let any = 0;
  $$(".grp").forEach(g => {
    let n = 0; const show = S.filter === "All" || g.dataset.grp === S.filter;
    $$(".dx", g).forEach(b => { const ok = show && (!q || q.split(/\s+/).every(w => b.dataset.q.includes(w))); b.hidden = !ok; if (ok) n++; });
    g.hidden = !n; $(".gc", g).textContent = n; any += n;
  });
  const r = $("#recent"); if (r) r.hidden = !!q || S.filter !== "All";
  $("#none").hidden = !!any;
  $$(".fchip").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === S.filter));
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
    `<div id="dec" style="display:flex;flex-direction:column;gap:8px;scroll-margin-top:130px">${d.decision.map((x, i) =>
      `<div class="decision ${i ? "ok" : ""}">${esc(x.t)}${chip(x.s)}</div>`).join("")}</div>`;
  shell({ d, tab: "arrival", body, head: jump });
}

const clip = (t, n) => t.split(" ").reduce((a, w) => (!a || (a + " " + w).length <= n) ? (a ? a + " " + w : w) : a, "");
const shortCol = t => t.split(/,| & | · /)[0];
function days(d, i) {
  const rows = d.chart.rows; i = Math.max(0, Math.min(rows.length - 1, i | 0)); const r = rows[i];
  const steps = `<nav class="steps" aria-label="Time points">${rows.map((x, j) =>
    `<button class="step ${j === i ? "on" : j < i ? "past" : ""}" data-go="#/dx/${d.id}/days/${j}" ${j === i ? 'aria-current="step"' : ""}>
      <span class="ln"><i class="${j === 0 ? "none" : j <= i ? "dark" : ""}"></i><span class="d"></span><i class="${j === rows.length - 1 ? "none" : j < i ? "dark" : ""}"></i></span>
      <b>${esc(x.label)}</b><span>${esc(clip(x.phase, 15))}</span></button>`).join("")}</nav>`;
  const c = d.chart.columns; const cols = [["feed", c.feed], ["tests", c.tests], ["treatment", c.treatment]];
  const seg = Math.min(2, S.seg);
  const body =
    `<div class="dayhead"><span class="big">${esc(r.label)}</span><span class="ph">${esc(r.phase)}</span></div>` +
    (r.lead ? `<div class="lead">${esc(r.lead)}</div>` : "") +
    (i === 0 && d.chart.standing ? card(d, /\//.test(d.chart.unit) ? "Throughout — every shift" : `Every ${d.chart.unit.toLowerCase()}, every shift`, d.chart.standing) : "") +
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
function differentials(d) {
  const rows = d.chart.rows; const sub = (t, a) => a && a.length ? `<h3 class="dsub">${t}</h3>${list(d, a)}` : "";
  const body = `<p class="hint">Tap “Chart” on a card to open the timeline row for that branch.</p>` + d.differentials.map(x => {
    const j = rows.findIndex(r => r.label === x.branch);
    return `<section class="card"><h2 class="ctitle">${esc(x.dx)}</h2>
      ${j >= 0 ? `<div class="toolrow"><button class="btn" data-go="#/dx/${d.id}/days/${j}">Chart: ${esc(x.branch)}${ico("next")}</button></div>` : ""}
      ${sub("Features", x.features)}${sub("Confirm", x.confirm)}${sub("Manage", x.manage)}${sub("Refer", x.refer)}</section>`;
  }).join("");
  shell({ d, tab: "differentials", body });
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
    `<div id="bdis" style="scroll-margin-top:120px">${card(d, d.discharge.title, d.discharge.items)}</div>` +
    `<div id="bfu" style="scroll-margin-top:120px">${card(d, d.followup.title, d.followup.items)}</div>`;
  shell({ d, tab: "doses", body, head: nav });
}

function nursing(d) {
  const n = d.nursing;
  const body = `<p class="hint">${esc(n.title)}. ${esc(n.period)}.</p>` + card(d, "Call the doctor", n.call, "red") +
    n.params.map(p => card(d, p.h, p.items)).join("") + card(d, "Totals each sheet", n.totals.map(t => ({ t })));
  shell({ d, tab: "nursing", body });
}

async function sources(d) {
  const rows = await Promise.all(d.sources.map(async id => {
    const s = S.sources[id] || { id, short: id, title: id, edition: "" }; const has = await getPdf(id);
    const off = S.offsets[id] ?? s.offset ?? 0;
    return `<div class="srow"><div class="t">${esc(s.title)}</div><div class="e">${esc(s.edition)}</div>
      <div class="acts"><span class="status ${has ? "ok" : "no"}">${has ? "PDF on this phone" : "No PDF loaded"}</span>
      <label class="btn primary">${has ? "Replace PDF" : "Load PDF"}<input type="file" accept="application/pdf" data-load="${id}" hidden></label>
      ${has ? `<button class="btn" data-del="${id}">Remove</button>` : ""}</div>
      <div class="acts off"><label>Page offset <input type="number" inputmode="numeric" value="${off}" data-off="${id}"></label>
      <span class="hint">PDF page minus printed page</span></div></div>`;
  }));
  shell({ d, tab: "sources", body: `<p class="hint">Guideline PDFs are stored only on this phone, so they work offline. Loading a newer edition replaces the old one; the page offset may then need adjusting.</p>${rows.join("")}` });
}

/* ---------- overflow menu ---------- */
function toggleMenu(d) {
  const m = $(".menu"); if (m) { m.remove(); $(".scrim")?.remove(); return; }
  document.body.insertAdjacentHTML("beforeend", `<div class="scrim" data-closemenu></div><div class="menu" role="menu">
    <button role="menuitem" id="vm">Verify mode<span class="state">${S.verify ? "On" : "Off"}</span></button>
    <button role="menuitem" data-resetchk="${d.id}">Reset checklist</button>
    <button role="menuitem" data-go="#/">All pathways</button></div>`);
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
  const [id, pg] = src.split(":"); const s = S.sources[id] || { short: id, title: id };
  const printed = parseInt(pg, 10) || 1; const off = Number(S.offsets[id] ?? s.offset ?? 0);
  const v = document.createElement("div"); v.className = "viewer";
  v.innerHTML = `<div class="vbar"><button data-x>Close</button><span class="vt">${esc(s.short)} · ${/^\d/.test(pg) ? "printed p" + printed : esc(pg) + " (page 1 shown)"}</span>
    <button data-p="-1" aria-label="Previous page">‹</button><button data-p="1" aria-label="Next page">›</button>
    <button data-z="-1" aria-label="Zoom out">−</button><button data-z="1" aria-label="Zoom in">+</button></div><div class="stage"></div>`;
  document.body.appendChild(v); const stage = $(".stage", v);
  v.querySelector("[data-x]").onclick = () => v.remove();
  const blob = await getPdf(id);
  if (!blob) { stage.innerHTML = `<div class="msg">No PDF loaded for ${esc(s.title)}.<br><br>Open the Sources tab and load it from your phone. It stays available offline.</div>`; return; }
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
      stage.replaceChildren(c); $(".vt", v).textContent = `${s.short} · printed p${page - off} · PDF p${page}/${doc.numPages}`;
    };
    v.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { page = Math.min(doc.numPages, Math.max(1, page + +b.dataset.p)); draw(); });
    v.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zoom = Math.min(3, Math.max(.6, zoom * (b.dataset.z > 0 ? 1.3 : 1 / 1.3))); draw(); });
    await draw();
  } catch (e) { stage.innerHTML = `<div class="msg">Could not open the PDF: ${esc(e.message)}</div>`; }
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
  if (t.dataset.filter) { S.filter = t.dataset.filter; applyFilter(); return; }
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
document.addEventListener("input", e => { if (e.target.id === "q") applyFilter(); });
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
    if (p[0] !== "dx") return home();
    const d = await getDx(p[1]); const tab = ["days", "differentials", "doses", "nursing", "sources"].includes(p[2]) ? p[2] : "arrival";
    remember(d.id, tab, p[3]);
    if (tab === "days") return days(d, parseInt(p[3] || "0", 10));
    if (tab === "differentials" && (d.differentials || []).length) return differentials(d);
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
