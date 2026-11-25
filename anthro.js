// anthro.js — anthropometry cards: paediatric 0–5 y and 5–19 y (WHO z-scores via anthro_z.js + who_lms.json) and adult (formulas[].expr).
// Loaded by app.js, which passes its helpers in. The pure functions (evalExpr, bandIndex, ...) are exported for tests/anthro.test.mjs.
// The JSON supplies every label, band, colour and sentence; this file only decides which band a number falls in.

/* ===================================== pure helpers ===================================== */
// Safe arithmetic evaluator for formulas[].expr (no eval): numbers, variables, + - × * / ÷ ^ ( ), sqrt/abs/min/max/ln/log10. Missing variable -> NaN.
export function evalExpr(expr, vars = {}) {
  const src = String(expr).replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/");
  const tok = []; const re = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z_0-9]*)|(.))/gy; let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) { if (m[1] != null) tok.push({ n: +m[1] }); else if (m[2]) tok.push({ id: m[2] }); else if (m[3]) tok.push({ op: m[3] }); }
  let i = 0; const peek = () => tok[i], op = o => peek() && peek().op === o && (i++, true);
  const FN = { sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, ln: Math.log, log10: Math.log10 };
  function prim() {
    const t = tok[i++]; if (!t) throw new Error("unexpected end of formula");
    if (t.n != null) return t.n;
    if (t.id) { if (peek() && peek().op === "(") { i++; const a = []; if (!op(")")) { do a.push(add()); while (op(",")); if (!op(")")) throw new Error("missing )"); }
      const f = FN[t.id.toLowerCase()]; if (!f) throw new Error(`unknown function ${t.id}`); return f(...a); }
      return t.id in vars && Number.isFinite(+vars[t.id]) ? +vars[t.id] : NaN; }
    if (t.op === "(") { const v = add(); if (!op(")")) throw new Error("missing )"); return v; }
    throw new Error(`unexpected "${t.op}"`);
  }
  function pow() { const b = prim(); return op("^") ? Math.pow(b, unary()) : b; }
  function unary() { if (op("-")) return -unary(); if (op("+")) return unary(); return pow(); }
  function mul() { let v = unary(); for (;;) { if (op("*")) v *= unary(); else if (op("/")) v /= unary(); else return v; } }
  function add() { let v = mul(); for (;;) { if (op("+")) v += mul(); else if (op("-")) v -= mul(); else return v; } }
  const v = add(); if (i < tok.length) throw new Error("extra text in formula"); return v;
}
export const canEval = (expr, vars) => { try { evalExpr(expr, vars); return true; } catch { return false; } };

const num = s => String(s).replace(/[−–]/g, "-").replace(/ /g, " ");
// Numeric band text -> test. Handles "< a", "> a", "≥ a", "≤ a", "a – b", "a – < b", "Below -a", "-a to < -b", "≥ -a". null when the text is not numeric.
export function bandTest(text) {
  const t = num(text).replace(/\b(cm|men|women|kg)\b/g, "").replace(/%/g, "").trim(); let m;
  if ((m = t.match(/^(?:below|<)\s*(-?[\d.]+)$/i))) return x => x < +m[1];
  if ((m = t.match(/^>\s*\+?(-?[\d.]+)/))) return x => x > +m[1];
  if ((m = t.match(/^[≥>=]=?\s*\+?(-?[\d.]+)/))) return x => x >= +m[1];
  if ((m = t.match(/^\+?(-?[\d.]+)\s*(?:to|-)\s*<\s*\+?(-?[\d.]+)$/i))) return x => x >= +m[1] && x < +m[2];
  if ((m = t.match(/^\+?(-?[\d.]+)\s*(?:to|-)\s*\+?(-?[\d.]+)$/i))) return x => x >= +m[1] && x <= +m[2];
  return null;
}
// Index of the item whose band holds x. Items are tested in order; the LAST match wins (so "18.5 – 25" then "≥ 25" gives ≥ 25 at 25).
export function bandIndex(items, x, skip = () => false) {
  if (!Number.isFinite(x)) return -1; let hit = -1;
  items.forEach((it, i) => { if (skip(it)) return; const f = bandTest(it.band); if (f && f(x)) hit = i; });
  return hit;
}
// z-score band rules per component key. Bands are listed on the card as text; the few that are not plain numeric ranges are handled here.
export function zBand(key, items, z) {
  if (!Number.isFinite(z)) return -1;
  const find = re => items.findIndex(it => re.test(it.band));
  if (key === "WFL/H") return z > 2 ? find(/\/\s*>\s*\+?3/) : bandIndex(items, z, it => /\//.test(it.band));
  if (key === "BMI/A" && items.length === 2) return z > 3 ? find(/^>\s*\+?3/) : z > 2 ? find(/^>\s*\+?2/) : -1;    // 0–5 y: only > +2 / > +3 are listed
  return bandIndex(items, z, it => /^>\s*\d+\s*y/.test(it.band));                                                  // skips "> 10 y" (an age band, not a z band)
}
export const todayStr = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s));
const nz = v => { if (v === "" || v == null) return NaN; const n = +v; return Number.isFinite(n) ? n : NaN; };

// Inputs object (strings from the form) -> AnthroZ.compute params, or {error}
export function paedsParams(v, withPreterm) {
  if (!validDate(v.dob) || !validDate(v.date)) return { wait: "Enter the date of birth and the date measured." };
  if (v.sex !== "1" && v.sex !== "2") return { wait: "Choose the sex." };
  if (Date.parse(v.date) < Date.parse(v.dob)) return { error: "The date measured is before the date of birth." };
  if (Date.parse(v.date) > Date.parse(todayStr()) + 864e5) return { error: "The date measured is in the future." };
  let ga = null;
  if (withPreterm) {
    if (v.preterm === "1") { ga = nz(v.ga_weeks); if (!Number.isFinite(ga)) return { wait: "Enter the gestational age in weeks, or answer No." };
      if (ga < 22 || ga >= 37) return { error: "Gestational age for a premature baby should be 22 to 36 weeks." }; }
  }
  const w = nz(v.weight), h = nz(v.lenhei ?? v.height), mu = nz(v.muac);
  if (Number.isFinite(w) && (w <= 0 || w > 250)) return { error: "Check the weight." };
  if (Number.isFinite(h) && (h <= 0 || h > 250)) return { error: "Check the length / height." };
  const p = { sex: +v.sex, dob: v.dob, date: v.date, gaWeeks: ga, weightKg: Number.isFinite(w) ? w : undefined, lenheiCm: Number.isFinite(h) ? h : undefined, oedema: v.oedema === "1" };
  if (v.measure === "l" || v.measure === "h") p.measure = v.measure;
  if (Number.isFinite(mu)) p.muacCm = mu;
  return { p };
}

/* ===================================== card module ===================================== */
let anthroPromise = null, lmsPromise = null;
const loadScript = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load " + src)); document.head.appendChild(s); });
export const loadAnthro = () => anthroPromise ||= (window.AnthroZ ? Promise.resolve(window.AnthroZ) : loadScript("anthro_z.js").then(() => window.AnthroZ)).catch(e => { anthroPromise = null; throw e; });
export const loadLms = () => lmsPromise ||= fetch("data/who_lms.json").then(r => { if (!r.ok) throw new Error("who_lms.json " + r.status); return r.json(); }).catch(e => { lmsPromise = null; throw e; });

export function createAnthroCards(H) {
  const { S, esc, $, $$, plus, cardHeader, scPdfRows, srcCheck, app } = H;
  const V = () => S.sc.v;
  const f1 = x => String(Math.round(x * 10) / 10), f2 = x => (Math.round(x * 100) / 100).toFixed(2);
  const sgn = z => (z > 0 ? "+" : z < 0 ? "−" : "") + Math.abs(z).toFixed(2);
  const mark = it => it.d === false ? plus(it.s) : "";
  const li = it => `<li><div class="body"><span class="txt">${esc(it.t)}${mark(it)}</span></div></li>`;
  const banner = (level, html) => `<div class="sbn l-${level}">${html}</div>`;
  const inp = (k, label, unit = "", o = {}) => `<label class="ni"><span class="nl">${esc(label)}</span><span class="inp"><input type="${o.type || "number"}" ${o.type === "date" ? "" : `inputmode="decimal" step="any"`} data-v="${k}" value="${esc(V()[k] ?? "")}" autocomplete="off"><em>${esc(unit)}</em></span></label>`;
  const seg = (k, opts, cur) => `<div class="seg2 s22" role="group">${opts.map(([v, t]) => `<button data-at="${k}:${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(t)}</button>`).join("")}</div>`;
  const panel = (title, inner) => `<section class="card"><h2 class="ctitle">${esc(title)}</h2><div class="pin">${inner}</div></section>`;
  const SEXOPT = [["1", "Male"], ["2", "Female"]];
  const YN = [["1", "Yes"], ["0", "No"]];

  // build the form from inputs[] (the "top" question first)
  function formHtml(d) {
    const ins = [...d.inputs].sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0));
    const shown = i => !i.show_if || V()[i.show_if] === "1";
    const rows = ins.filter(shown).map(i => {
      if (i.type === "yesno") return `<div class="rg"><div class="rgl">${esc(i.label)}</div>${seg(i.key, YN, V()[i.key])}</div>`;
      if (i.type === "choice") { const opts = i.key === "sex" ? SEXOPT : i.key === "measure" ? [["l", "Lying (length)"], ["h", "Standing (height)"]] : i.options.map(o => [o, o]);
        return `<div class="rg"><div class="rgl">${esc(i.label)}${i.key === "measure" ? " <em>(default by age)</em>" : ""}</div>${seg(i.key, opts, V()[i.key])}</div>`; }
      if (i.type === "date") return inp(i.key, i.label, "", { type: "date" });
      return inp(i.key, i.label + (i.optional ? " (optional)" : ""), i.unit || "");
    });
    // group: top question, then dates, sex etc. as written; numbers in a grid
    const out = []; let grid = [];
    const flush = () => { if (grid.length) out.push(`<div class="ngrid">${grid.join("")}</div>`); grid = []; };
    ins.filter(shown).forEach((i, n) => { const h = rows[n]; if (/class="ni"/.test(h)) grid.push(h); else { flush(); out.push(h); } }); flush();
    return `<div class="anq">${d.top_question ? `<p class="hint" style="margin:0 4px 6px">${esc(d.top_question.t)}${mark(d.top_question)}</p>` : ""}${out.join("")}</div>`;
  }

  function bandsCard(c, hit, valueHtml) {
    return `<section class="card"><h2 class="ctitle">${esc(c.name)} <span class="rd">${esc(c.range)}</span></h2><div class="pin">${valueHtml || ""}<div class="sbl">${c.items.map((it, i) =>
      `<div class="bnd l-${it.level} ${i === hit ? "act" : ""}"><span class="sbl-l">${esc(it.band)}</span><span class="sbl-t">${esc(it.label)}${mark(it)}</span></div>`).join("")}</div></div></section>`;
  }
  const valueLine = (label, val, sub) => `<div class="sbn l-grey"><b>${esc(label)}</b> ${val}${sub ? ` <span class="sub2">${sub}</span>` : ""}</div>`;
  const comp = (d, k) => d.components.find(c => c.key === k);
  const flagFor = (r, k) => r.flags[k] ? `<span class="flag">${esc(r.flags[k])}</span>` : "";

  /* ---------- paediatric (WHO z-scores) ---------- */
  function paeds(d, is05) {
    const q = paedsParams(V(), is05);
    if (q.wait) return { bar: [{ label: "z-scores", value: "—", sub: q.wait, chips: [] }], html: "" };
    if (q.error) return { bar: [{ label: "z-scores", value: "—", sub: "check the entries", chips: [] }], html: banner("amber", esc(q.error)) };
    if (!window.AnthroZ || !S.lms) return { bar: [{ label: "z-scores", value: "…", sub: "loading the WHO tables", chips: [] }], html: `<p class="hint">Loading the WHO tables (saved on the device after the first time).</p>`, loading: true };
    const r = window.AnthroZ.compute(S.lms, q.p), ageMo = r.ageDays / 30.4375, p = q.p;
    const ageTxt = ageMo < 24 ? `${f1(ageMo)} months` : `${f1(ageMo / 12)} years`;
    const head = [valueLine("Age", `${esc(ageTxt)}${r.corrected ? ` · corrected age used: ${f1(r.ageDaysUsed / 30.4375)} months` : ""}`)];
    const wrongCard = is05 ? (Math.floor(r.ageDays + 0.5) > 1856 ? "This child is older than 5 years — use the Anthropometry 5–19 y card." : "")
      : (ageMo < 60 ? "This child is younger than 5 years — use the Anthropometry 0–5 y card." : ageMo >= 229 ? "Older than 19 years — use the Anthropometry adult card." : "");
    if (wrongCard) return { bar: [{ label: "z-scores", value: "—", sub: "wrong age card", chips: [{ t: "Use the other card", level: "amber" }] }], html: head.join("") + banner("amber", `<b>${esc(wrongCard)}</b>`) };
    const out = [...head], chips = [], flagged = [];
    const items = [];
    const add = (key, z, valueHtml, hit) => { const c = comp(d, key); if (!c) return; const i = hit ?? zBand(key, c.items, z);
      items.push(bandsCard(c, i, valueHtml)); if (i >= 0 && ["red", "amber", "purple", "orange"].includes(c.items[i].level)) chips.push({ t: `${key} ${c.items[i].label.replace(/ →.*$/, "")}`, level: c.items[i].level }); };
    const zv = (label, z, key) => valueLine(label, `<b class="zv">z ${sgn(z)}</b>`, flagFor(r, key));
    if (is05) {
      if (r.z.wfa != null) add("WFA", r.z.wfa, zv("Weight-for-age", r.z.wfa, "wfa"));
      if (r.z.lhfa != null) add("L/HFA", r.z.lhfa, zv(`${r.clenhei != null && ageMo >= 24 ? "Height" : "Length"}-for-age`, r.z.lhfa, "lhfa") + (r.clenhei != null && p.lenheiCm != null && r.clenhei !== p.lenheiCm ? valueLine("Adjusted", `${f1(r.clenhei)} cm`, "0.7 cm length ↔ height rule") : ""));
      if (r.z.wflh != null) add("WFL/H", r.z.wflh, zv("Weight-for-length / height", r.z.wflh, "wflh"));
      if (r.z.bfa != null) add("BMI/A", r.z.bfa, valueLine("BMI", `<b>${f1(r.bmi)}</b> kg/m²`, `z ${sgn(r.z.bfa)} ${flagFor(r, "bfa")}`));
      if (p.muacCm != null) { const c = comp(d, "MUAC"), mo = ageMo;
        const inRange = mo >= 6 && mo < 60, i = inRange ? bandIndex(c.items, p.muacCm) : -1;
        add("MUAC", NaN, valueLine("MUAC", `<b>${f1(p.muacCm)}</b> cm`, r.z.acfa != null ? `z ${sgn(r.z.acfa)} ${flagFor(r, "acfa")}` : "") + (inRange ? "" : `<p class="hint" style="margin:4px">${mo < 6 ? "MUAC cut-offs apply from 6 months." : "MUAC cut-offs apply to 6–59 months."}</p>`), i); }
      if (p.oedema) { chips.push({ t: "Oedema", level: "red" }); }
      const sam = (r.z.wflh != null && r.z.wflh < -3) || (p.muacCm != null && ageMo >= 6 && ageMo < 60 && p.muacCm < 11.5) || p.oedema;
      if (sam) out.push(banner("red", `<b>${esc(d.interpretation_stg[0].t)}</b>${mark(d.interpretation_stg[0])}`));
    } else {
      if (r.z.bfa != null) add("BMI/A", r.z.bfa, valueLine("BMI", `<b>${f1(r.bmi)}</b> kg/m²`, `z ${sgn(r.z.bfa)} ${flagFor(r, "bfa")}`));
      if (r.z.hfa != null) add("HFA", r.z.hfa, zv("Height-for-age", r.z.hfa, "hfa"));
      const wfa = comp(d, "WFA");
      if (r.z.wfa != null) add("WFA", r.z.wfa, zv("Weight-for-age", r.z.wfa, "wfa"));
      else if (p.weightKg != null && ageMo >= 121) items.push(bandsCard(wfa, wfa.items.findIndex(it => /y$/.test(it.band)), ""));
      // target height from the parents (formulas boy/girl)
      const fh = nz(V().father_height), mh = nz(V().mother_height);
      if (Number.isFinite(fh) && Number.isFinite(mh)) { const f = d.formulas.find(x => x.id === (p.sex === 1 ? "target_height_boy" : "target_height_girl")), t = evalExpr(f.expr, { father_height: fh, mother_height: mh }), rng = +String(f.range).replace(/[^\d.]/g, "");
        out.push(banner("grey", `<b>${esc(f.name)} (adult height): ${f1(t)} cm</b> <span class="sub2">(± ${rng} cm: ${f1(t - rng)}–${f1(t + rng)})${mark(f)}</span><div class="sub2">${esc(d.interpretation_stg[2].t)}</div>`)); }
    }
    out.push(...items);
    if (p.oedema) out.push(banner("amber", `<b>Oedema</b> — weight-based z-scores are not calculated.`));
    // implausible flags
    Object.keys(r.flags).forEach(k => flagged.push(k));
    if (flagged.length) out.unshift(banner("amber", `<b>Implausible value — re-measure</b> (${flagged.map(k => esc(k.toUpperCase())).join(", ")})`));
    // engine notes (corrected age, 0.7 cm rule, range limits ...)
    if (r.notes.length) out.push(`<section class="card"><h2 class="ctitle">Notes from the calculation</h2><ul class="items sl">${r.notes.map(n => li({ t: n })).join("")}</ul></section>`);
    out.push(`<section class="card"><h2 class="ctitle">Interpretation (STG)</h2><ul class="items sl">${d.interpretation_stg.map(it => `<li class="bnd l-${it.level}"><div class="body"><span class="txt">${esc(it.t)}${mark(it)}</span></div></li>`).join("")}</ul></section>`);
    const zs = [["WFA", r.z.wfa], [is05 ? "L/HFA" : "HFA", r.z.lhfa ?? r.z.hfa], ["WFL/H", r.z.wflh], ["BMI/A", r.z.bfa]].filter(x => x[1] != null);
    return { bar: [{ label: `z-scores · ${r.table}`, value: zs.length ? zs.map(x => `${x[0]} ${sgn(x[1])}`).join("  ") : "—", sub: r.corrected ? "corrected age" : "", chips: chips.slice(0, 5) }], html: out.join("") };
  }

  /* ---------- adult (formulas[].expr) ---------- */
  function adult(d) {
    const sex = V().sex, w = nz(V().weight), h = nz(V().height), wc = nz(V().waist), uw = nz(V().usual_weight);
    const F = id => d.formulas.find(f => f.id === id), ev = (id, vars) => evalExpr(F(id).expr, vars);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return { bar: [{ label: "BMI", value: "—", sub: "enter weight and height", chips: [] }], html: "" };
    if (w <= 0 || w > 500 || h < 50 || h > 250) return { bar: [{ label: "BMI", value: "—", sub: "check the entries", chips: [] }], html: banner("amber", "Check the weight (kg) and the height (cm).") };
    const vars = { weight_kg: w, height_cm: h, usual_weight: uw }, chips = [], out = [];
    const bmi = ev("bmi", vars), bc = comp(d, "BMI"), bi = bandIndex(bc.items, bmi);
    if (bi >= 0 && bc.items[bi].level !== "green") chips.push({ t: bc.items[bi].label.replace(/ \(.*$/, ""), level: bc.items[bi].level });
    out.push(bandsCard(bc, bi, valueLine("BMI", `<b>${f1(bmi)}</b> ${esc(F("bmi").units)}`, `${esc(F("bmi").expr)}${mark(F("bmi"))}`)));
    // waist
    if (Number.isFinite(wc) && (sex === "1" || sex === "2")) { const c = comp(d, "WC"), men = sex === "1";
      const i = c.items.findIndex(it => (men ? /\bmen\b/ : /women/).test(it.band) && (men ? !/women/.test(it.band) : true)), hit = i >= 0 && bandTest(c.items[i].band)(wc) ? i : -1;
      if (hit >= 0) chips.push({ t: "Central obesity", level: c.items[hit].level });
      out.push(bandsCard(c, hit, valueLine("Waist", `<b>${f1(wc)}</b> cm`, men ? "men" : "women"))); }
    else if (Number.isFinite(wc)) out.push(`<p class="hint">Choose the sex to read the waist circumference.</p>`);
    // weight loss
    if (Number.isFinite(uw) && uw > 0) { const loss = ev("wt_loss", vars), c = comp(d, "WL");
      const i = loss > 0 ? bandIndex(c.items, loss) : -1; if (i >= 0) chips.push({ t: `Weight loss ${f1(loss)}%`, level: c.items[i].level });
      out.push(bandsCard(c, i, valueLine("Weight change", `<b>${loss >= 0 ? "−" : "+"}${f1(Math.abs(loss))}</b> %`, `${f1(uw)} → ${f1(w)} kg${mark(F("wt_loss"))}`))); }
    // derived values: IBW, ABW, BSA, tidal volume
    const rows = [];
    if (sex === "1" || sex === "2") {
      const fi = F(sex === "1" ? "ibw_m" : "ibw_f"), ibw = evalExpr(fi.expr, vars); vars.IBW = ibw;
      rows.push([fi.name, `${f1(ibw)} ${fi.units}`, `${fi.expr}${mark(fi)}`]);
      const fa = F("abw"), abw = evalExpr(fa.expr, vars);
      rows.push([fa.name, `${f1(abw)} ${fa.units}`, `${fa.expr}${mark(fa)}${bmi > 40 ? ` · <b>BMI ${f1(bmi)} > 40: dose on this weight</b>` : ""}`]);
      const fv = F("vt"), m = String(fv.expr).replace(/[–−]/g, "-").match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mL\s*[×x*]\s*IBW/i);
      if (m) rows.push([fv.name, `${Math.round(evalExpr(`${m[1]} * IBW`, vars))}–${Math.round(evalExpr(`${m[2]} * IBW`, vars))} mL`, `${fv.expr}${mark(fv)}`]);
    } else rows.push(["Ideal / adjusted weight, tidal volume", "—", "choose the sex"]);
    const fb = F("bsa"); rows.push([fb.name, `${f2(ev("bsa", vars))} ${fb.units}`, `${fb.expr}${mark(fb)}`]);
    out.push(`<section class="card"><h2 class="ctitle">Calculated values</h2><div class="pin">${rows.map(([n, v, e]) => `<div class="sbn l-grey"><b>${esc(n)}</b> <span class="zv">${esc(v)}</span><div class="sub2">${e}</div></div>`).join("")}</div></section>`);
    out.push(`<section class="card"><h2 class="ctitle">Interpretation (STG)</h2><ul class="items sl">${d.interpretation_stg.map(it => `<li class="bnd l-${it.level}"><div class="body"><span class="txt">${esc(it.t)}${mark(it)}</span></div></li>`).join("")}</ul></section>`);
    return { bar: [{ label: "BMI", value: f1(bmi), sub: "kg/m²", chips }], html: out.join("") };
  }

  /* ---------- page ---------- */
  function pages(d) { const m = new Map(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    if (k === "s" && typeof v === "string") { const [id, ...pg] = v.split(":"), s = m.get(id) || new Set(); if (pg.length) s.add(pg.join(":")); m.set(id, s); } else walk(v); } })(d); return m; }
  const isPaeds = () => S.sc.id !== "anthropometry-adult";
  async function render(id, e, d) {
    if (!S.sc || S.sc.id !== id) { S.sc = { id, d, e, v: { date: id === "anthropometry-adult" ? undefined : todayStr() }, kind: "anthro", cor: new Set() }; const w = [...srcCheck(d)]; if (w.length) console.warn(`Card ${id}:\n - ` + w.join("\n - ")); }
    S.sc.d = d; S.sc.e = e; S.sc.kind = "anthro";
    const pg = pages(d), notes = d.notes || [];
    app.innerHTML = cardHeader(d, "Calculator").replace("{{extra}}", "") + `<main class="fade scorepage sc22 vit" id="anthro22"><p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}</p>
      <div id="an-in">${panel(isPaeds() ? "Child" : "Patient", formHtml(d))}</div><div class="wtotal" id="an-bar" aria-live="polite"></div><div id="an-res"></div>
      ${notes.length ? `<details class="vfoot"><summary>Notes (${notes.length})</summary><ul class="items sl">${notes.map(li).join("")}</ul></details>` : ""}
      <details class="vfoot"><summary>Formulas (${d.formulas.length})</summary><ul class="items sl">${d.formulas.map(f => `<li><div class="body"><span class="txt"><b>${esc(f.name)}</b> — <code>${esc(f.expr)}</code>${f.units ? ` (${esc(f.units)})` : ""}${f.range ? ` ${esc(f.range)}` : ""}${f.notation ? `<span class="lic">${esc(f.notation)}</span>` : ""}${mark(f)}</span></div></li>`).join("")}</ul></details>
      <details class="vfoot"><summary>Sources</summary><p class="hint" style="margin:6px 4px">${esc(d.dagger_note || "")}</p><ul class="items sl">${d.sources.map(s => `<li><div class="body"><span class="txt"><b>${esc(s.id)}</b> — ${esc(s.title)}${s.url ? ` · <a class="ref" href="${esc(s.url)}" target="_blank" rel="noopener">open online</a>` : ""}${pg.get(s.id)?.size ? `<span class="lic">pages: ${[...pg.get(s.id)].map(esc).join(", ")}</span>` : ""}</span></div></li>`).join("")}</ul>${await scPdfRows(d)}</details>
      ${e?.pdf ? `<div class="toolrow" style="justify-content:flex-start;padding:0 4px"><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">View card (PDF)</a></div>` : ""}</main>`;
    if (isPaeds() && !S.lms) { try { const [, lms] = await Promise.all([loadAnthro(), loadLms()]); S.lms = lms; } catch (err) { console.warn("anthropometry tables", err); S.lmsErr = err.message; } }
    update();
  }
  function update() {
    const d = S.sc?.d; if (!d || !$("#an-bar")) return;
    let r;
    if (isPaeds() && S.lmsErr) r = { bar: [{ label: "z-scores", value: "—", sub: "tables not available", chips: [] }], html: banner("amber", `<b>The WHO tables could not be loaded</b> (${esc(S.lmsErr)}). Open this card once with a connection; it is then saved for offline use.`) };
    else try { r = isPaeds() ? paeds(d, d.id === "anthropometry-paeds-0-5") : adult(d); } catch (err) { console.warn("anthropometry error", err); r = { bar: [], html: `<p class="hint">Could not calculate: ${esc(err.message)}</p>` }; }
    $("#an-bar").innerHTML = `<div class="wbar">${r.bar.map(b => `<div class="wcol"><div class="wl">${esc(b.label)}</div><div class="wv"><b>${esc(b.value)}</b><span> ${esc(b.sub || "")}</span></div>
      <div class="tsub">${(b.chips || []).map(c => `<span class="sbc l-${c.level || "grey"}">${esc(c.t)}</span>`).join("")}</div></div>`).join("")}<button class="clr" data-anreset>Reset</button></div>`;
    $("#an-res").innerHTML = r.html || "";
  }
  const live = () => S.sc?.kind === "anthro" && $("#anthro22");
  const redo = () => { $("#an-in").innerHTML = panel(isPaeds() ? "Child" : "Patient", formHtml(S.sc.d)); update(); };
  document.addEventListener("input", ev => { const t = ev.target; if (!live() || !t.dataset?.v) return; V()[t.dataset.v] = t.value; update(); });
  document.addEventListener("change", ev => { const t = ev.target; if (!live() || !t.dataset?.v || t.type !== "date") return; V()[t.dataset.v] = t.value; update(); });
  document.addEventListener("click", ev => {
    if (!live()) return; const t = ev.target.closest?.("button"); if (!t) return;
    if (t.dataset.anreset !== undefined) { S.sc.v = { date: isPaeds() ? todayStr() : undefined }; render(S.sc.id, S.sc.e, S.sc.d); return; }
    if (t.dataset.at) { const [k, v] = t.dataset.at.split(":"); V()[k] = V()[k] === v && (k === "measure" || k === "oedema") ? "" : v; if (k === "preterm" && v === "0") delete V().ga_weeks; redo(); }
  });

  return { render };
}
