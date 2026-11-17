// Formulary — one page per medicine (data/formulary/<id>.json), an index page, and automatic links
// from medicine names anywhere in the app to their formulary page. Wired in from app.js via fxInit().
let H = null;                       // helpers handed over by app.js: { esc, ico, chip, app, S }
let IDX = { drugs: [] }, RXI = null, RXC = null, TO = new Map(), obs = null, CUR = null, fgrp = "All";
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
const POPL = { adult: "Adult", phc: "Primary care", obstetric: "Obstetric", paed: "Paediatric", neonate: "Neonate", all: "All ages" };
const SECS = [["moa", "Mechanism of action"], ["forms", "Forms and strengths"], ["pk", "Onset, duration, elimination"], ["dosing", "Dosing"],
  ["administration", "Administration"], ["adjustments", "Dose adjustments"], ["contraindications", "Contraindications"], ["cautions", "Cautions and interactions"],
  ["adverse_effects", "Adverse effects"], ["monitoring", "Monitoring"], ["toxicity", "Overdose and antidote"], ["conflicts", "Guideline vs package insert"]];

export const fxCount = () => IDX.drugs.length;
export async function fxInit(h) {
  H = h;
  try { IDX = await (await fetch("data/formulary/index.json")).json(); } catch { IDX = { drugs: [] }; }
  const ci = [], cs = [];
  for (const d of IDX.drugs) {
    for (const a of d.link || []) { TO.set(a.toLowerCase(), d.id); ci.push(a); }
    for (const a of d.link_cs || []) { TO.set("\u0001" + a, d.id); cs.push(a); }
  }
  const alt = l => l.sort((a, b) => b.length - a.length).map(reEsc).join("|");
  if (ci.length) RXI = new RegExp("(^|[^A-Za-z0-9])(" + alt(ci) + ")(?![A-Za-z])", "gi");
  if (cs.length) RXC = new RegExp("(^|[^A-Za-z0-9])(" + alt(cs) + ")(?![A-Za-z0-9])", "g");
  obs = new MutationObserver(() => { clearTimeout(obs.t); obs.t = setTimeout(linkify, 30); });
  obs.observe(H.app, { childList: true, subtree: true });
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-fgrp], [data-fback], [data-fjump]"); if (!t) return;
    if (t.dataset.fgrp !== undefined) { fgrp = t.dataset.fgrp; applyFilter(); }
    else if (t.dataset.fback !== undefined) { if (history.length > 1) history.back(); else location.hash = "#/formulary"; }
    else if (t.dataset.fjump) document.getElementById(t.dataset.fjump)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.addEventListener("input", e => { if (e.target.id === "fq") applyFilter(); });
}

/* ---------- automatic links: medicine names in any page text -> #/drug/<id> ---------- */
const SKIP = "a, button, input, textarea, select, label, h1, script, style, nav, header, .chip, .nolink";
function hits(text) {
  const out = [];
  for (const [rx, cs] of [[RXI, false], [RXC, true]]) {
    if (!rx) continue; rx.lastIndex = 0; let m;
    while ((m = rx.exec(text))) {
      const id = TO.get(cs ? "\u0001" + m[2] : m[2].toLowerCase());
      if (id && id !== CUR) out.push({ i: m.index + m[1].length, n: m[2].length, id });
      rx.lastIndex = m.index + m[1].length + m[2].length;
    }
  }
  out.sort((a, b) => a.i - b.i || b.n - a.n);
  const keep = []; let end = 0;
  for (const h of out) if (h.i >= end) { keep.push(h); end = h.i + h.n; }
  return keep;
}
function linkify() {
  const root = H.app.querySelector("main"); if (!root || (!RXI && !RXC)) return;
  obs.disconnect();
  try {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.length < 4 || n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      const t = n.nodeValue, hs = hits(t); if (!hs.length) continue;
      const f = document.createDocumentFragment(); let p = 0;
      for (const h of hs) {
        if (h.i > p) f.append(t.slice(p, h.i));
        const a = document.createElement("a"); a.className = "dlink"; a.href = "#/drug/" + h.id; a.textContent = t.slice(h.i, h.i + h.n);
        f.append(a); p = h.i + h.n;
      }
      if (p < t.length) f.append(t.slice(p));
      n.replaceWith(f);
    }
  } finally { obs.observe(H.app, { childList: true, subtree: true }); }
}

/* ---------- index page ---------- */
function applyFilter() {
  const q = (document.getElementById("fq")?.value || "").trim().toLowerCase(); let shown = 0;
  document.querySelectorAll("[data-fgrp]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fgrp === fgrp)));
  document.querySelectorAll("section[data-fg]").forEach(s => {
    let n = 0;
    s.querySelectorAll(".dx").forEach(b => { const ok = (fgrp === "All" || s.dataset.fg === fgrp) && (!q || b.dataset.q.includes(q)); b.hidden = !ok; if (ok) n++; });
    s.hidden = !n; const c = s.querySelector(".gc"); if (c) c.textContent = n; shown += n;
  });
  const none = document.getElementById("fnone"); if (none) none.hidden = shown > 0;
}
export function fxHome() {
  const { esc, ico, app } = H; CUR = null;
  const groups = [...new Set(IDX.drugs.map(d => d.group))].sort((a, b) => a.localeCompare(b));
  const lists = groups.map(g => { const items = IDX.drugs.filter(d => d.group === g);
    return `<section class="grp" data-fg="${esc(g)}"><h2 class="glabel">${esc(g)}<span class="c">· <span class="gc">${items.length}</span></span></h2>
      <div class="list">${items.map(d => `<button class="dx" data-go="#/drug/${esc(d.id)}" data-q="${esc([d.name, d.class, ...(d.aliases || [])].join(" ").toLowerCase())}">
        <span class="t">${esc(d.name)}</span><span class="p">${esc(d.class)} ${d.verified ? '<span class="fxtag ok">checked</span>' : '<span class="fxtag">draft</span>'}</span>${ico("next")}</button>`).join("")}</div></section>`; }).join("");
  app.innerHTML = `
  <header class="top"><div class="hometop"><div class="brand"><button class="iconbtn" aria-label="Back to start" data-go="#/">${ico("back")}</button>
    <div class="ttl"><h1>Formulary</h1><div class="sub">${IDX.drugs.length} medicines · works offline</div></div></div>
    <label class="search">${ico("search")}<span class="sr">Search medicines</span><input id="fq" type="search" placeholder="Search — e.g. ceftriaxone, MgSO₄, opioid" autocomplete="off"></label>
    <div class="chips">${["All", ...groups].map(g => `<button class="fchip" data-fgrp="${esc(g)}" aria-pressed="${fgrp === g}">${esc(g)}</button>`).join("")}</div></div></header>
  <main class="fade home scores">${lists}<p class="empty" id="fnone" hidden>No medicine matches.</p>
    <p class="hint">"checked" = non-guideline lines verified against the package insert. "draft" = pharmacology not yet verified and doses extracted automatically — confirm before relying on it. † = not in the SA guideline.</p></main>`;
  applyFilter();
}

/* ---------- medicine page ---------- */
function line(it) {
  const { esc, chip } = H;
  const src = it.s === "pi" ? '<span class="chip pi nolink">Package insert</span>' : it.s ? chip(it.s) : "";
  const mark = (it.d ? '<span class="dag">†</span>' : "") + (it.n ? '<span class="fxnote" title="From own notes">notes</span>' : "");
  return `<li class="${it.b ? "b" : ""}"><div class="body"><span class="txt">${it.h && it.t ? `<b>${esc(it.h)}:</b> ` : ""}${esc(it.t || it.h)}${mark}</span>${src}</div></li>`;
}
const ul = items => `<ul class="items fx">${items.map(line).join("")}</ul>`;
function usedIn(d) {
  const { esc, S } = H, ix = S.index, found = [], rest = [];
  for (const id of d.used_in || []) {
    const hit = (list, mk) => { const e = (list || []).find(x => x.id === id || x.file === id + ".json"); if (e) found.push([mk(e), e.short || e.title]); return !!e; };
    hit(ix.diagnoses, e => `#/dx/${e.id}/doses`) || hit(ix.procedures, e => `#/proc/${e.id}`) || hit(ix.scores, e => `#/score/${e.id}`) || rest.push(id);
  }
  if (!found.length && !rest.length) return "";
  return `<section class="card" id="fx-used"><h2 class="ctitle">Used in</h2><div class="fxused">${found.map(([go, t]) => `<button class="fchip" data-go="${esc(go)}">${esc(t)}</button>`).join("")}</div>
    ${rest.length ? `<p class="hint2 fxpad">Also in ${rest.length} pathway${rest.length === 1 ? "" : "s"} or card${rest.length === 1 ? "" : "s"} not yet loaded in the app.</p>` : ""}</section>`;
}
export async function fxView(id) {
  const { esc, ico, app } = H;
  const r = await fetch("data/formulary/" + encodeURIComponent(id) + ".json"); if (!r.ok) throw new Error("unknown medicine " + id);
  const d = await r.json(); CUR = d.id;
  const secs = SECS.filter(([k]) => (d[k] || []).length);
  const body = secs.map(([k, title]) => {
    let inner;
    if (k === "dosing") inner = (d.dosing_note ? `<p class="hint2 fxpad">${esc(d.dosing_note)}</p>` : "") + d.dosing.map(b =>
      `<div class="fxblock"><h3><span class="fxpop ${esc(b.pop)}">${esc(POPL[b.pop] || b.pop)}</span>${esc(b.h)}</h3>${ul(b.items)}</div>`).join("");
    else inner = ul(d[k]);
    return `<section class="card ${k === "contraindications" ? "red" : ""}" id="fx-${k}"><h2 class="ctitle">${title}</h2>${inner}</section>`;
  }).join("");
  const nodose = !(d.dosing || []).length && d.dosing_note ? `<section class="card" id="fx-dosing"><h2 class="ctitle">Dosing</h2><p class="hint2 fxpad">${esc(d.dosing_note)}</p></section>` : "";
  const pi = d.pi_source ? `<p class="hint2">Package insert consulted: ${esc(d.pi_source.title)}</p>` : "";
  app.innerHTML = `
  <header class="top"><div class="bar"><button class="iconbtn" aria-label="Back" data-fback>${ico("back")}</button>
    <div class="ttl"><div class="row1"><h1>${esc(d.name)}</h1></div><div class="sub">${esc(d.class)}</div></div></div>
    <nav class="boxnav" aria-label="Sections">${secs.map(([k, t]) => `<button class="fchip" data-fjump="fx-${k}">${esc(t.split(",")[0].split(" and ")[0])}</button>`).join("")}
      ${(d.used_in || []).length ? '<button class="fchip" data-fjump="fx-used">Used in</button>' : ""}</nav></header>
  <main class="fade fxpage">
    ${d.verified ? "" : `<div class="fxbanner">${ico("warn")}<span><b>Draft page.</b> The pharmacology lines (†) have not been checked against the package insert, and the doses were extracted automatically from the guideline text. Confirm on the cited page before relying on it.</span></div>`}
    ${d.summary ? `<p class="fxsum">${esc(d.summary)}</p>` : ""}
    ${(d.aliases || []).length ? `<p class="hint2 nolink">Also written as: ${esc(d.aliases.join(", "))}</p>` : ""}
    ${body}${nodose}${usedIn(d)}
    <p class="hint">${esc(d.dagger_note || "† = not in the SA guideline.")} The pathway dose stays authoritative for its indication.</p>${pi}</main>`;
  window.scrollTo(0, 0);
}
