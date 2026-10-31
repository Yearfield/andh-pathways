// vitals.js — urine dipstick ("tap the strip"), adult vitals (NEWS2) and paediatric vitals by age. Loaded by app.js, which passes its helpers in.
// Same pattern as scores.js / RASS: the JSON supplies every label, band, range and clinical sentence; the rules are explicit functions in calc.js.
// Source marks: d === false (SA guideline) gets the app's source mark; d === true gets none. Sources and pages are listed in a collapsible footer.
import * as C from "./calc.js";

export function createVitalCards(H) {
  const { S, esc, $, $$, plus, cardHeader, scPdfRows, srcCheck, app } = H;
  const V = () => S.sc.v, nv = k => C.toNum(V()[k]);
  const f1 = x => String(Math.round(x * 10) / 10);
  const mark = it => it.d === false ? plus(it.s) : "";
  const li = it => `<li><div class="body"><span class="txt">${esc(it.t)}${mark(it)}</span></div></li>`;
  const banner = (level, html) => `<div class="sbn l-${level}">${html}</div>`;
  const textOn = hex => { const n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#13202b" : "#fff"; };
  const num = (k, label, unit = "", o = {}) => `<label class="ni"><span class="nl">${esc(label)}</span><span class="inp"><input type="number" inputmode="decimal" step="${o.step || "any"}" data-v="${k}" value="${esc(V()[k] ?? "")}" autocomplete="off"><em>${esc(unit)}</em></span></label>`;
  const seg = (k, opts, cur) => `<div class="seg2 s22" role="group">${opts.map(([v, t]) => `<button data-vt="${k}:${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(t)}</button>`).join("")}</div>`;
  const toggle = (k, text) => `<div class="cr"><label class="ci"><input type="checkbox" data-v="${k}" ${V()[k] ? "checked" : ""}><span class="ct">${esc(text)}</span></label></div>`;
  const panel = (title, inner) => `<section class="card"><h2 class="ctitle">${esc(title)}</h2><div class="pin">${inner}</div></section>`;
  const lvl = s => ["green", "amber", "orange", "red"][Math.min(3, Math.max(0, s))];
  const SPEC = {};

  /* ===================================== URINE DIPSTICK ===================================== */
  const PAT_LABEL = { 1: "if UTI symptoms", 5: "if urobilinogen absent" };  // qualifiers from the brief; the sentences themselves come from patterns[]
  function strip(d) {
    const sel = V().pads || {};
    return `<div class="strip" role="group" aria-label="Urine test strip">${d.components.map(c => { const si = sel[c.key], col = si != null ? c.items[si].colour : null;
      return `<div class="pad"><div class="srail"><span class="swatch ${col ? "" : "empty"}" style="${col ? `background:${col}` : ""}"></span></div>
        <div class="pdbody"><div class="phd"><b>${esc(c.key)}</b><span>${esc(c.name)}</span><em>read ${esc(c.read)}</em></div>
        <div class="chips22">${c.items.map((it, i) => `<button class="cc ${si === i ? "on" : ""}" style="--bg:${it.colour};--fg:${textOn(it.colour)}" data-pad="${c.key}:${i}" aria-pressed="${si === i}" aria-label="${esc(c.name)} ${esc(it.grade)}">${esc(it.grade)}</button>`).join("")}</div></div></div>`; }).join("")}</div>`;
  }
  SPEC["urine-dipstick"] = {
    ui: d => panel("Specimen", `${toggle("preg", "Pregnant")}<p class="hint" style="margin:2px 4px">${esc(d.colour_note)}</p>`) + `<div id="strip22">${strip(d)}</div>`,
    paint: d => { $("#strip22").innerHTML = strip(d); },
    calc: d => {
      const sel = V().pads || {}, g = {}, abn = [], info = [];
      d.components.forEach(c => { const i = sel[c.key]; if (i == null) return; g[c.key] = c.items[i].grade;
        if (C.padAbnormal(c.key, i)) abn.push({ c, i }); else if (["PH", "SG"].includes(c.key)) info.push({ c, i }); });
      const pats = C.dipPatterns(g), preg = !!V().preg, pinned = [];
      const lines = x => preg ? x.filter(m => !C.isPregnancyLine(m.s)) : x;
      if (preg) abn.forEach(({ c, i }) => c.means.filter(m => C.isPregnancyLine(m.s)).forEach(m => pinned.push({ pad: `${c.key} ${c.items[i].grade}`, m })));
      const padCard = ({ c, i }) => { const ms = lines(c.means), ps = c.pitfalls;
        return `<section class="card"><h2 class="ctitle"><span class="gchip" style="background:${c.items[i].colour};color:${textOn(c.items[i].colour)}">${esc(c.items[i].grade)}</span> ${esc(c.name)} <span class="rd">read ${esc(c.read)}</span></h2>
          <ul class="items sl">${ms.map(li).join("")}</ul>${ps.length ? `<div class="pit"><div class="rgl">Pitfalls</div><ul class="items sl">${ps.map(li).join("")}</ul></div>` : ""}</section>`; };
      const patHtml = pats.map((ok, i) => ok ? `<li class="bnd l-${i === 0 ? "green" : i === 5 ? "grey" : "amber"} act"><div class="body"><span class="txt">${PAT_LABEL[i] ? `<em class="plbl">${esc(PAT_LABEL[i])}</em> ` : ""}${esc(d.patterns[i].t)}${mark(d.patterns[i])}</span></div></li>` : "").join("");
      const html = (Object.keys(sel).length ? "" : `<p class="hint">Tap the colour on each pad that matches your strip (default: not read).</p>`)
        + (preg && pinned.length ? `<section class="card"><h2 class="ctitle">Pregnancy — pinned</h2><ul class="items sl">${pinned.map(p => `<li><div class="body"><span class="txt"><b>${esc(p.pad)}</b> ${esc(p.m.t)}${mark(p.m)}</span></div></li>`).join("")}</ul></section>` : "")
        + (patHtml ? `<section class="card"><h2 class="ctitle">Patterns</h2><ul class="items sl">${patHtml}</ul></section>` : "")
        + abn.map(padCard).join("")
        + info.map(({ c, i }) => `<div class="sbn l-grey"><b>${esc(c.name)} ${esc(c.items[i].grade)}</b> — normal: ${esc(c.normal)}</div>`).join("");
      return { bar: [{ label: "Dipstick", value: String(abn.length), sub: abn.length === 1 ? "abnormal pad" : "abnormal pads", chips: abn.map(({ c, i }) => ({ t: `${c.key} ${c.items[i].grade}`, level: "amber" })) }], html };
    },
  };

  /* ===================================== ADULT VITALS (NEWS2) ===================================== */
  const ruler = (c, idx, manual) => `<div class="ruler">${c.items.map((it, i) => `<div class="rseg l-${lvl(it.score)} ${i === idx ? "act" : ""}"><span class="rt">${esc(it.t)}</span><span class="rp">${it.score}</span></div>`).join("")}</div>`;
  const newsIn = () => ({ rr: nv("rr"), spo2: nv("spo2"), scale2: V().scale === "2", spo2Points: V().sp2 === "" || V().sp2 == null ? NaN : nv("sp2"), o2: V().o2 === "1" ? true : V().o2 === "0" ? false : null,
    sbp: nv("sbp"), hr: nv("hr"), cns: V().cns === "1" ? true : V().cns === "0" ? false : null, temp: nv("temp") });
  SPEC["vitals-adult"] = {
    ui: d => { const C_ = k => d.components.find(c => c.key === k), preg = !!V().preg, s2 = V().scale === "2";
      const block = (k, body) => `<section class="card" data-par="${k}"><h2 class="ctitle">${esc(C_(k).name)} <span class="pts" data-pts="${k}"></span></h2><div class="pin">${body}${preg ? "" : `<div data-ruler="${k}"></div>`}</div></section>`;
      return panel("Patient", toggle("preg", "Pregnant (NEWS2 is not used)")) + block("RR", num("rr", "Respiratory rate", "/min"))
        + block("SPO2", `${seg("scale", [["1", "Scale 1"], ["2", "Scale 2"]], V().scale || "1")}${num("spo2", "SpO₂", "%")}${s2 ? `<p class="hint" style="margin:4px">${esc(C_("SPO2").note)}</p><div class="rg"><div class="rgl">SpO₂ points on Scale 2 (read from the chart)</div>${seg("sp2", [["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]], V().sp2)}</div>` : ""}`)
        + block("O2", seg("o2", C_("O2").items.map((it, i) => [String(i), `${it.t} (${it.score})`]), V().o2))
        + block("SBP", num("sbp", "Systolic BP", "mmHg")) + panel("Diastolic BP (not scored)", num("dbp", "Diastolic BP", "mmHg"))
        + block("HR", num("hr", "Pulse", "/min")) + block("CNS", seg("cns", C_("CNS").items.map((it, i) => [String(i), `${it.t} (${it.score})`]), V().cns))
        + block("T", num("temp", "Temperature", "°C", { step: 0.1 })); },
    paint: d => { const r = C.news2(d, newsIn());
      $$("[data-ruler]").forEach(el => { const k = el.dataset.ruler, c = d.components.find(x => x.key === k), p = r.parts[k];
        el.innerHTML = (k === "SPO2" && V().scale === "2") ? "" : ruler(c, p.idx); });
      $$("[data-pts]").forEach(el => { const p = r.parts[el.dataset.pts]; el.textContent = p.score == null ? "" : `${p.score} point${p.score === 1 ? "" : "s"}`; el.className = "pts " + (p.score == null ? "" : "l-" + lvl(p.score)); }); },
    calc: d => {
      const preg = !!V().preg, r = C.news2(d, newsIn()), cl = d.interpretation_classic, fm = id => d.formulas.find(f => f.id === id);
      const sbp = nv("sbp"), dbp = nv("dbp"), hr = nv("hr"), rr = nv("rr"), spo2 = nv("spo2"), rel = d.related;
      const fl = C.adultFlags({ spo2, sbp, dbp, rr, pregnant: preg, scale2: V().scale === "2" });
      // haemodynamics from formulas[]
      const hemo = []; const both = Number.isFinite(sbp) && Number.isFinite(dbp);
      if (both) { const map = C.mapOf(sbp, dbp), f = fm("map"); hemo.push([`${f.name} ${f1(map)} ${f.units}`, map < 65 ? "red" : "green", `${f.target}${mark(f)}`, map < 65 ? "MAP < 65" : ""]);
        const pp = C.pulsePressure(sbp, dbp), g = fm("pulse_pressure"); hemo.push([`${g.name} ${f1(pp)} ${g.units}`, C.narrowPulsePressure(sbp, dbp) ? "amber" : "green", `${g.target}${mark(g)}`, C.narrowPulsePressure(sbp, dbp) ? "narrow" : ""]); }
      if (Number.isFinite(hr) && Number.isFinite(sbp) && sbp > 0) { const si = C.shockIndex(hr, sbp), f = fm("shock_index"); hemo.push([`${f.name} ${(Math.round(si * 100) / 100).toFixed(2)}`, si > 1 ? "red" : "green", `${f.target}${mark(f)}`, si > 1 ? "SI > 1" : ""]); }
      const hemoHtml = hemo.length ? `<section class="card"><h2 class="ctitle">Haemodynamics</h2><div class="pin">${hemo.map(([t, l, sub, flag]) => `<div class="sbn l-${l}"><b>${esc(t)}</b>${flag ? ` <span class="flag">${esc(flag)}</span>` : ""}<div class="sub2">${sub}</div></div>`).join("")}</div></section>` : "";
      const relIdx = [fl.oxygen && 0, fl.hypertension && 1, !preg && fl.severePreg && 2, !preg && fl.ewc && 3, fl.sedation && 4].filter(x => x !== false);
      const relHtml = relIdx.length ? `<section class="card"><h2 class="ctitle">Related</h2><ul class="items sl">${relIdx.map(i => `<li class="bnd l-${i === 3 ? "amber" : "red"} act"><div class="body"><span class="txt">${esc(rel[i].t)}${mark(rel[i])}</span></div></li>`).join("")}</ul></section>` : "";
      if (preg) return { bar: [{ label: "NEWS2", value: "—", sub: "not used in pregnancy", chips: [{ t: "Use the maternity EWC", level: "amber" }] }],
        html: banner("amber", `<b>${esc(rel[3].t)}</b>${mark(rel[3])}`) + (fl.severePreg ? banner("red", `<b>${esc(rel[2].t)}</b>${mark(rel[2])}`) : "") + hemoHtml + relHtml };
      const bandRows = cl.map((b, i) => { const act = b.single3 ? r.single3 : i === r.band;
        return `<div class="bnd l-${b.level} ${act ? "act" : ""}"><span class="sbl-l">${b.single3 ? "Any 3" : b.min === b.max ? b.min : `${b.min}–${b.max}`}</span><span class="sbl-t">${esc(b.t)}</span></div>`; }).join("");
      const f = fm("news2");
      const chips = [...(r.band >= 0 ? [{ t: cl[r.band].t.split(" — ")[0], level: cl[r.band].level }] : []), ...(r.single3 ? [{ t: "Any single 3", level: "amber" }] : [])];
      return { bar: [{ label: f.name, value: r.entered ? String(r.total) : "—", sub: r.complete ? `/ ${f.range[1]}` : `${r.entered} of ${r.of} entered`, chips }],
        html: `<section class="card"><h2 class="ctitle">Response</h2><div class="pin"><div class="sbl">${bandRows}</div></div></section>` + hemoHtml + relHtml };
    },
  };

  /* ===================================== PAEDIATRIC VITALS ===================================== */
  const AGE_UNITS = [["d", "days"], ["m", "months"], ["y", "years"]];
  const rbar = (label, unit, r, v) => { const lo = Math.floor(r.min * 0.5), hi = Math.ceil(r.max * 1.4), pct = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)), st = C.rangeStatus(v, r);
    return `<div class="rb"><div class="rbh"><b>${esc(label)}</b><span>${r.min}–${r.max} ${esc(unit)}</span>${st ? `<span class="st st-${st}">${st === "within" ? "within" : st}${Number.isFinite(v) ? ` (${f1(v)})` : ""}</span>` : ""}</div>
      <div class="rtrack"><span class="zone" style="left:${pct(r.min)}%;width:${pct(r.max) - pct(r.min)}%"></span>${Number.isFinite(v) ? `<span class="mk2 st-${st}" style="left:${pct(v)}%"></span>` : ""}</div></div>`; };
  const months = () => { const a = nv("age"); return Number.isFinite(a) && a >= 0 ? C.ageMonths(a, V().unit || "y") : NaN; };
  SPEC["vitals-paeds"] = {
    ui: d => panel("Child", `<div class="ngrid"><label class="ni"><span class="nl">Age</span><span class="inp"><input type="number" inputmode="decimal" step="any" data-v="age" value="${esc(V().age ?? "")}" autocomplete="off"></span></label></div>${seg("unit", AGE_UNITS, V().unit || "y")}
      <div class="ngrid">${num("wt", "Weight (optional)", "kg")}${num("hr", "Heart rate", "/min")}${num("rr", "Respiratory rate", "/min")}${num("sbp", "Systolic BP", "mmHg")}${num("spo2", "SpO₂", "%")}${num("crt", "Capillary refill (optional)", "s")}</div>`)
      + `<div id="bars22"></div>`,
    paint: d => { const m = months(), i = C.paedsRowIdx(d.ranges, m), el = $("#bars22"); if (!el) return;
      if (i < 0) { el.innerHTML = `<p class="hint">Enter the child's age to pick the range row.</p>`; return; }
      const r = d.ranges[i]; el.innerHTML = `<section class="card"><h2 class="ctitle">Acceptable ranges — ${esc(r.age)} row</h2><div class="pin">${rbar("Heart rate", "/min", r.hr, nv("hr"))}${rbar("Respiratory rate", "/min", r.rr, nv("rr"))}${rbar("Systolic BP", "mmHg", r.sbp, nv("sbp"))}</div></section>`; },
    calc: d => {
      const m = months(), i = C.paedsRowIdx(d.ranges, m), rel = d.related, fm = id => d.formulas.find(f => f.id === id);
      if (i < 0) return { bar: [{ label: "Vitals by age", value: "—", sub: "enter the age", chips: [] }], html: "" };
      const r = d.ranges[i], hr = nv("hr"), rr = nv("rr"), sbp = nv("sbp"), spo2 = nv("spo2"), crt = nv("crt"), out = [], flags = [];
      const sts = { HR: C.rangeStatus(hr, r.hr), RR: C.rangeStatus(rr, r.rr), SBP: C.rangeStatus(sbp, r.sbp) };
      Object.entries(sts).forEach(([k, s]) => { if (s && s !== "within") flags.push({ t: `${k} ${s}`, level: "amber" }); });
      // weight: the typed value, else the (age + 4) × 2 estimate for 1–10 y, else the row's typical weight
      const w = nv("wt"), est = C.weightEstimate(m), wf = fm("wt_apls");
      out.push(Number.isFinite(w) ? `<div class="sbn l-grey">Weight <b>${f1(w)} kg</b> (entered)</div>`
        : est != null ? `<div class="sbn l-grey">Weight <b>≈ ${est} kg</b> — estimate: ${esc(wf.name)}, ${esc(wf.expr)} ${esc(wf.units)}${mark(wf)}</div>` : `<div class="sbn l-grey">Typical weight for the ${esc(r.age)} row: ${r.weight_kg} kg</div>`);
      // hypotension
      const h = C.paedsHypotension(m);
      if (h && Number.isFinite(sbp)) { const f = fm(h.id), low = sbp < h.threshold;
        out.push(banner(low ? "red" : "green", `<b>${low ? "Hypotension" : "Not hypotensive"}</b> — ${esc(f.name)}: ${esc(f.expr)} = <b>${h.threshold} ${esc(f.units)}</b>; SBP ${f1(sbp)}${mark(f)}`));
        if (low) flags.unshift({ t: "Hypotension", level: "red" }); }
      else if (!h) out.push(`<div class="sbn l-grey">No hypotension threshold is printed on the card from 11 years.</div>`);
      // related[] flags
      const lim = C.tachypnoeaLimit(rel[0].t, m), related = [];
      if (lim != null && rr > lim) { related.push([0, "amber", `RR ${f1(rr)} is above the STG limit of ${lim}/min`]); flags.push({ t: "Tachypnoea", level: "amber" }); }
      if (spo2 < 92) { related.push([1, "red", ""]); flags.push({ t: "SpO₂ < 92 %", level: "red" }); }
      if (crt >= 3) { related.push([2, "red", ""]); flags.push({ t: "CRT ≥ 3 s", level: "red" }); }
      out.push(...related.map(([k, l, extra]) => banner(l, `${extra ? `<div class="sub2">${esc(extra)}</div>` : ""}<b>${esc(rel[k].t)}</b>${mark(rel[k])}`)));
      out.push(`<div class="sbn l-grey"><div class="rgl">Information only (no TEWS scoring)</div>${esc(rel[3].t)}</div>`);
      return { bar: [{ label: `Vitals · ${r.age} row`, value: flags.length ? String(flags.length) : "0", sub: flags.length === 1 ? "flag" : "flags", chips: flags.slice(0, 5) }], html: out.join("") };
    },
  };

  /* ---------- shared page ---------- */
  function pages(d) { // source -> pages used, from every "s" in the card
    const m = new Map(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
      if (k === "s" && typeof v === "string") { const [id, ...pg] = v.split(":"), s = m.get(id) || new Set(); if (pg.length) s.add(pg.join(":")); m.set(id, s); } else walk(v); } })(d); return m; }
  async function render(id, e, d) {
    const spec = SPEC[id];
    if (!S.sc || S.sc.id !== id) { S.sc = { id, d, e, v: {}, kind: "vit", cor: new Set() }; const w = [...srcCheck(d)]; if (w.length) console.warn(`Card ${id}:\n - ` + w.join("\n - ")); }
    S.sc.d = d; S.sc.e = e; S.sc.kind = "vit";
    const pg = pages(d), notes = d.discrepancies || [];
    app.innerHTML = cardHeader(d, "Calculator").replace("{{extra}}", "") + `<main class="fade scorepage sc22 vit" id="vit22"><p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}</p>
      <div id="vit-in">${spec.ui(d)}</div><div class="wtotal" id="vit-bar" aria-live="polite"></div><div id="vit-res"></div>
      ${(d.pearls || []).length ? `<section class="card"><h2 class="ctitle">Pearls</h2><ul class="items sl">${d.pearls.map(li).join("")}</ul></section>` : ""}
      ${notes.length ? `<details class="vfoot" ${V().preg && id === "urine-dipstick" ? "open" : ""}><summary>Guideline notes (${notes.length})</summary><ul class="items sl">${notes.map(li).join("")}</ul></details>` : ""}
      <details class="vfoot"><summary>Sources</summary><p class="hint" style="margin:6px 4px">${esc(d.card_note)}</p><ul class="items sl">${d.sources.map(s => `<li><div class="body"><span class="txt"><b>${esc(s.id)}</b> — ${esc(s.title)}${s.url ? ` · <a class="ref" href="${esc(s.url)}" target="_blank" rel="noopener">open online</a>` : ""}${pg.get(s.id)?.size ? `<span class="lic">pages: ${[...pg.get(s.id)].map(esc).join(", ")}</span>` : ""}</span></div></li>`).join("")}</ul>${await scPdfRows(d)}</details>
      ${e?.pdf ? `<div class="toolrow" style="justify-content:flex-start;padding:0 4px"><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">View card (PDF)</a></div>` : ""}</main>`;
    update();
  }
  function update() {
    const d = S.sc.d, spec = SPEC[S.sc.id]; if (!spec || !$("#vit-bar")) return;
    spec.paint?.(d);
    let r; try { r = spec.calc(d); } catch (err) { console.warn("vitals calculator error", err); r = { bar: [], html: `<p class="hint">Could not calculate: ${esc(err.message)}</p>` }; }
    $("#vit-bar").innerHTML = `<div class="wbar">${r.bar.map(b => `<div class="wcol"><div class="wl">${esc(b.label)}</div><div class="wv"><b>${esc(b.value)}</b><span> ${esc(b.sub || "")}</span></div>
      <div class="tsub">${(b.chips || []).map(c => `<span class="sbc l-${c.level || "grey"}">${esc(c.t)}</span>`).join("")}</div></div>`).join("")}<button class="clr" data-vreset>Reset</button></div>`;
    $("#vit-res").innerHTML = r.html || "";
  }
  const live = () => S.sc?.kind === "vit" && $("#vit22");
  const redo = () => { $("#vit-in").innerHTML = SPEC[S.sc.id].ui(S.sc.d); update(); };
  document.addEventListener("input", ev => { const t = ev.target; if (!live() || !t.dataset?.v || t.type === "checkbox") return; V()[t.dataset.v] = t.value; update(); });
  document.addEventListener("change", ev => { const t = ev.target; if (!live() || !t.dataset?.v || t.type !== "checkbox") return; V()[t.dataset.v] = t.checked;
    if (t.dataset.v === "preg") { if (S.sc.id === "urine-dipstick") $("details.vfoot")?.toggleAttribute("open", t.checked); redo(); } else update(); });
  document.addEventListener("click", ev => {
    if (!live()) return; const t = ev.target.closest?.("button"); if (!t) return;
    if (t.dataset.vreset !== undefined) { S.sc.v = {}; render(S.sc.id, S.sc.e, S.sc.d); return; }
    if (t.dataset.pad) { const [k, i] = t.dataset.pad.split(":"), p = V().pads ||= {}; if (p[k] === +i) delete p[k]; else p[k] = +i; update(); return; }
    if (t.dataset.vt) { const [k, v] = t.dataset.vt.split(":"); V()[k] = V()[k] === v && (k === "sp2" || k === "o2" || k === "cns") ? "" : v; redo(); }
  });

  return { render, SPEC };
}
