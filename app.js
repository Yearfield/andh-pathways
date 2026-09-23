// ANDH Pathways — offline reference app. Data lives in data/*.json (one file per diagnosis).
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("#app");
const LS_VER = "andh.verified", LS_OFF = "andh.offsets", LS_MODE = "andh.verifyMode", LS_CHK = "andh.checked";

const S = {
  index: null, sources: {}, dx: {}, verified: JSON.parse(localStorage.getItem(LS_VER) || "{}"),
  offsets: JSON.parse(localStorage.getItem(LS_OFF) || "{}"), verify: localStorage.getItem(LS_MODE) === "1",
  checked: JSON.parse(localStorage.getItem(LS_CHK) || "{}"),
};

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
async function getDx(id) {
  if (!S.dx[id]) { const e = S.index.diagnoses.find(d => d.id === id); S.dx[id] = await loadJSON("data/" + e.file); }
  return S.dx[id];
}

/* ---------- verification (key changes if the text or source changes -> item becomes unverified again) ---------- */
const key = (dx, it) => { let h = 5381, s = dx + "|" + (it.t || it.h) + "|" + (it.s || ""); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function allItems(d) {
  const out = []; const add = a => (a || []).forEach(i => i.t && out.push(i));
  d.admission.forEach(s => add(s.items)); add(d.decision); add(d.chart.standing);
  d.chart.rows.forEach(r => { add(r.feed); add(r.tests); add(r.treatment); if (r.lead) out.push({ t: r.lead }); });
  d.boxes.forEach(b => add(b.items)); add(d.discharge.items); add(d.followup.items);
  d.nursing.params.forEach(p => add(p.items)); add(d.nursing.call); return out;
}
const progress = d => { const a = allItems(d); const v = a.filter(i => S.verified[key(d.id, i)]).length; return [v, a.length]; };

/* ---------- item rendering ---------- */
function chip(src) {
  if (!src) return "";
  const [id, pg] = src.split(":"); const s = S.sources[id];
  return `<button class="chip" data-src="${esc(src)}" aria-label="Open ${esc(s ? s.short : id)} page ${esc(pg)}">${esc(s ? s.short : id)} p${esc(pg)}</button>`;
}
function li(d, it) {
  if (it.h && !it.t) return `<li class="head"><span class="txt">${esc(it.h)}${it.d ? '<span class="dag">†</span>' : ""}</span>${chip(it.s)}</li>`;
  const k = key(d.id, it); const vOn = S.verified[k]; const cOn = S.checked[k];
  const cls = [it.k === "sub" ? "sub" : "", it.b ? "b" : "", it.k === "yn" ? "yn" : "", cOn ? "checked" : ""].join(" ");
  const chk = `<button class="chk ${cOn ? "on" : ""}" data-chk="${k}" aria-pressed="${!!cOn}" aria-label="${cOn ? "Checked off" : "Mark done"}"></button>`;
  const tick = S.verify ? `<button class="tick ${vOn ? "on" : ""}" data-tick="${k}" aria-pressed="${!!vOn}" title="${vOn ? "Verified " + vOn : "Mark verified"}">✓</button>` : "";
  return `<li class="${cls}">${chk}<span class="txt">${esc(it.t)}${it.d ? '<span class="dag">†</span>' : ""}</span>${chip(it.s)}${tick}</li>`;
}
const list = (d, items) => `<ul class="items">${(items || []).map(i => li(d, i)).join("")}</ul>`;
const card = (d, title, items, n, note) =>
  `<section class="card" ${n ? `id="s${n}"` : ""}><h2>${n ? `<span class="n">${n}</span>` : ""}<span>${esc(title)}</span></h2>${note ? `<div class="note">${esc(note)}</div>` : ""}${list(d, items)}</section>`;

/* ---------- screens ---------- */
function shell(title, back, body, d, tab) {
  const [v, n] = d ? progress(d) : [0, 0];
  app.innerHTML = `
  <header class="top">${back ? `<button class="back" aria-label="Back" data-go="${back}">‹</button>` : ""}
    <h1>${esc(title)}</h1>
    ${d ? `<button class="verify-btn" aria-pressed="${S.verify}" id="vm">${S.verify ? "Verifying" : "Verify"}</button>` : ""}</header>
  ${d && S.verify ? `<div class="meter" title="${v} of ${n} verified"><i style="width:${n ? (100 * v / n) : 0}%"></i></div>` : ""}
  <main class="fade">${body}</main>
  ${d ? `<nav class="tabs">${[["arrival", "Arrival"], ["days", d.chart.unit + "s"], ["doses", "Doses"], ["nursing", "Nursing"], ["sources", "Sources"]]
      .map(([t, l]) => `<button data-go="#/dx/${d.id}/${t}" class="${tab === t ? "on" : ""}">${l}</button>`).join("")}</nav>` : ""}`;
}

function home() {
  const rows = S.index.diagnoses.map(e => `<button class="dx" data-go="#/dx/${e.id}/arrival"><div class="t">${esc(e.title)}</div><div class="p">${esc(e.short)} · ${esc(e.population)}</div></button>`).join("");
  shell("ANDH pathways", "", `<p class="hint">Reference only. No patient details are stored. Tap an amber tag to open the guideline page it comes from.</p>${rows}`);
}

function arrival(d) {
  const jump = `<div class="jump">${d.admission.map(s => `<button data-jump="s${s.n}">${s.n}</button>`).join("")}<button data-jump="dec">10–11</button></div>`;
  const reset = `<div class="toolrow"><button class="btn" data-resetchk="${d.id}">Reset checklist</button></div>`;
  const body = reset + jump + d.admission.map(s => card(d, s.title, s.items, s.n, s.note)).join("") +
    `<div id="dec">${d.decision.map(x => `<div class="decision">${esc(x.t)}</div>`).join("")}</div>`;
  shell(d.title, "#/", body, d, "arrival");
}

function days(d, i) {
  const rows = d.chart.rows; i = Math.max(0, Math.min(rows.length - 1, i | 0)); const r = rows[i];
  const strip = `<div class="days">${rows.map((x, j) => `<button data-go="#/dx/${d.id}/days/${j}" class="${j === i ? "on" : ""}"><b>${esc(x.label.replace(/^\D+/, "") || x.label)}</b>${esc(x.phase.split(" ")[0])}</button>`).join("")}</div>`;
  const c = d.chart.columns;
  const body = strip +
    `<div class="dayhead"><span class="big">${esc(r.label)}</span><span class="ph">${esc(r.phase)}</span></div>` +
    (i === 0 ? card(d, `Every ${d.chart.unit.toLowerCase()}, every shift`, d.chart.standing) : "") +
    (r.lead ? `<div class="lead">${esc(r.lead)}</div>` : "") +
    card(d, c.feed, r.feed) + card(d, c.tests, r.tests) + card(d, c.treatment, r.treatment) +
    (d.chart.phase_note ? `<p class="hint">${esc(d.chart.phase_note)}</p>` : "") +
    `<div class="pager"><button data-go="#/dx/${d.id}/days/${i - 1}" ${i === 0 ? "disabled" : ""}>‹ ${i > 0 ? esc(rows[i - 1].label) : ""}</button>
      <button data-go="#/dx/${d.id}/days/${i + 1}" ${i === rows.length - 1 ? "disabled" : ""}>${i < rows.length - 1 ? esc(rows[i + 1].label) : ""} ›</button></div>`;
  shell(d.title, "#/", body, d, "days");
  const on = $(".days .on"); on && on.scrollIntoView({ inline: "center", block: "nearest" });
  swipe(d, i);
}

function doses(d) {
  const body = d.boxes.map(b => card(d, b.title, b.items)).join("") + card(d, d.discharge.title, d.discharge.items) + card(d, d.followup.title, d.followup.items);
  shell(d.title, "#/", body, d, "doses");
}

function nursing(d) {
  const n = d.nursing;
  const body = `<p class="hint">${esc(n.title)}. ${esc(n.period)}.</p>` + n.params.map(p => card(d, p.h, p.items)).join("") +
    card(d, "Call the doctor", n.call) + card(d, "Totals each sheet", n.totals.map(t => ({ t })));
  shell(d.title, "#/", body, d, "nursing");
}

async function sources(d) {
  const ids = d.sources;
  const rows = await Promise.all(ids.map(async id => {
    const s = S.sources[id] || { id, short: id, title: id, edition: "" }; const has = await getPdf(id);
    const off = S.offsets[id] ?? s.offset ?? 0;
    return `<div class="srow"><div class="t">${esc(s.title)}</div><div class="e">${esc(s.edition)}</div>
      <div class="acts"><span class="status ${has ? "ok" : "no"}">${has ? "PDF on this phone" : "No PDF loaded"}</span>
      <label class="btn primary">${has ? "Replace PDF" : "Load PDF"}<input type="file" accept="application/pdf" data-load="${id}" hidden></label>
      ${has ? `<button class="btn" data-del="${id}">Remove</button>` : ""}</div>
      <div class="acts off"><label>Page offset <input type="number" inputmode="numeric" value="${off}" data-off="${id}"></label>
      <span class="hint" style="margin:0">PDF page minus printed page</span></div></div>`;
  }));
  shell(d.title, "#/", `<p class="hint">Guideline PDFs are stored only on this phone, so they work offline. Loading a newer edition replaces the old one; the page offset may then need adjusting.</p>${rows.join("")}`, d, "sources");
}

/* ---------- swipe between chart rows ---------- */
function swipe(d, i) {
  let x0 = null, y0 = null; const m = $("main");
  m.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  m.addEventListener("touchend", e => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) location.hash = `#/dx/${d.id}/days/${i + (dx < 0 ? 1 : -1)}`;
  }, { passive: true });
}

/* ---------- PDF viewer ---------- */
let pdfjs = null;
async function openSource(src) {
  const [id, pg] = src.split(":"); const s = S.sources[id] || { short: id, title: id };
  const printed = parseInt(pg, 10); const off = Number(S.offsets[id] ?? s.offset ?? 0);
  const v = document.createElement("div"); v.className = "viewer";
  v.innerHTML = `<div class="bar"><button data-x>Close</button><span class="ttl">${esc(s.short)} · printed p${printed}</span>
    <button data-p="-1">‹</button><button data-p="1">›</button><button data-z="-1">−</button><button data-z="1">+</button></div><div class="stage"></div>`;
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
      stage.replaceChildren(c); $(".ttl", v).textContent = `${s.short} · printed p${page - off} · PDF p${page}/${doc.numPages}`;
    };
    v.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { page = Math.min(doc.numPages, Math.max(1, page + +b.dataset.p)); draw(); });
    v.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { zoom = Math.min(3, Math.max(.6, zoom * (b.dataset.z > 0 ? 1.3 : 1 / 1.3))); draw(); });
    await draw();
  } catch (e) { stage.innerHTML = `<div class="msg">Could not open the PDF: ${esc(e.message)}</div>`; }
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("button, label"); if (!t) return;
  if (t.dataset.go !== undefined) { location.hash = t.dataset.go || "#/"; return; }
  if (t.dataset.src) { openSource(t.dataset.src); return; }
  if (t.dataset.jump) { document.getElementById(t.dataset.jump)?.scrollIntoView({ block: "start" }); window.scrollBy(0, -60); return; }
  if (t.id === "vm") { S.verify = !S.verify; localStorage.setItem(LS_MODE, S.verify ? "1" : "0"); route(); return; }
  if (t.dataset.tick) {
    const k = t.dataset.tick; if (S.verified[k]) delete S.verified[k]; else S.verified[k] = new Date().toISOString().slice(0, 10);
    localStorage.setItem(LS_VER, JSON.stringify(S.verified)); const y = window.scrollY; await route(); window.scrollTo(0, y); return;
  }
  if (t.dataset.chk) {
    const k = t.dataset.chk; if (S.checked[k]) delete S.checked[k]; else S.checked[k] = new Date().toISOString().slice(0, 10);
    localStorage.setItem(LS_CHK, JSON.stringify(S.checked)); const y = window.scrollY; await route(); window.scrollTo(0, y); return;
  }
  if (t.dataset.resetchk) {
    if (!confirm("Clear all checklist ticks for this diagnosis?")) return;
    const dd = await getDx(t.dataset.resetchk);
    allItems(dd).forEach(it => delete S.checked[key(dd.id, it)]);
    localStorage.setItem(LS_CHK, JSON.stringify(S.checked)); route(); return;
  }
  if (t.dataset.del) { await delPdf(t.dataset.del); route(); }
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.dataset.load && t.files[0]) { await putPdf(t.dataset.load, t.files[0]); route(); }
  if (t.dataset.off !== undefined) { S.offsets[t.dataset.off] = parseInt(t.value || "0", 10); localStorage.setItem(LS_OFF, JSON.stringify(S.offsets)); }
});

async function route() {
  const p = (location.hash || "#/").slice(2).split("/");
  try {
    if (p[0] !== "dx") return home();
    const d = await getDx(p[1]); const tab = p[2] || "arrival";
    if (tab === "days") return days(d, parseInt(p[3] || "0", 10));
    if (tab === "doses") return doses(d);
    if (tab === "nursing") return nursing(d);
    if (tab === "sources") return sources(d);
    return arrival(d);
  } catch (err) { app.innerHTML = `<main><p class="hint">Could not load this page: ${esc(err.message)}. Open the app once with signal so it can save itself for offline use.</p></main>`; }
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
init();
