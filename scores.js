// scores.js — interface for the block-schema score cards (Alvarado … COPD-GOLD). Loaded by app.js, which passes its helpers in.
//
// A card's JSON gives labels, points, bands, colours and source marks (left[] / right[] layout blocks). This file turns that into the
// same interface as the Wells card: tick / select items -> live total -> coloured band -> STG text underneath. The human-readable
// formulas[].expr strings are never evaluated: every calculation is an explicit function in calc.js.
import * as C from "./calc.js";

export function createScoreCards(H) {
  const { S, esc, $, $$, ico, plus, cardHeader, TYPE_LABEL, scSrcList, scPdfRows, srcCheck, app } = H;
  const V = () => S.sc.v, on = k => !!V()[k], nv = k => C.toNum(V()[k]);
  const pm = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x);            // signed, true minus
  const f1 = x => String(Math.round(x * 10) / 10), f0 = x => String(Math.round(x));
  const blk = (d, id) => { const [side, i] = id.split("."); return d[side][+i]; };
  const LV = l => ["green", "teal", "amber", "orange", "red", "purple", "blue", "grey"].includes(l) ? l : "grey";
  const chipOf = b => ({ t: [b.label, String(b.t || "").split(" — ")[0]].filter(Boolean).join(" · "), level: b.level });

  /* ---------- small building blocks ---------- */
  const note = it => it.c ? { btn: `<button class="cor c22" data-c22 aria-label="STG discrepancy: tap for note">‡</button>`, txt: `<div class="cnote" hidden>${esc(it.c === true ? it.t : it.c)}</div>` } : { btn: "", txt: "" };
  const chk = (k, text, o = {}) => `<div class="cr"><label class="ci"><input type="checkbox" data-k="${k}" ${on(k) ? "checked" : ""}><span class="ct">${esc(text)}</span>${o.pts != null ? `<span class="cpt">${pm(o.pts)}</span>` : ""}</label>${o.s ? plus(o.s) : ""}</div>`;
  const radio = (name, val, score, text) => `<label class="ro"><input type="radio" name="${name}" data-k="${name}" value="${esc(val)}" ${String(V()[name] ?? "") === String(val) ? "checked" : ""}><span>${score !== "" && score != null ? `<b>${esc(score)}</b> ` : ""}${esc(text)}</span></label>`;
  const num = (k, label, unit = "", o = {}) => `<label class="ni"><span class="nl">${esc(label)}</span><span class="inp"><input type="number" inputmode="decimal" step="${o.step || "any"}" data-k="${k}" value="${esc(V()[k] ?? "")}" placeholder="${esc(o.ph || "")}" autocomplete="off"><em>${esc(unit)}</em></span></label>`;
  const sel = (k, label, opts) => `<label class="si"><span class="nl">${label}</span><select data-k="${k}"><option value="">—</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(V()[k] ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const sub = t => `<h3 class="sub22">${esc(t)}</h3>`;
  const panel = (title, inner, s) => `<section class="card"><h2 class="ctitle">${esc(title)}${s ? plus(s) : ""}</h2><div class="pin">${inner}</div></section>`;
  const bandsRes = (items, a, title) => `${title ? sub(title) : ""}<div class="sbl">${items.map((b, i) => `<div class="bnd l-${LV(b.level)} ${i === a ? "act" : ""}"><span class="sbl-l">${esc(b.label ?? "")}</span><span class="sbl-t">${esc(b.t || "")}${plus(b.s)}</span></div>`).join("")}</div>`;
  const banner = (level, text, s) => `<div class="sbn l-${LV(level)}">${esc(text)}${s ? plus(s) : ""}</div>`;
  const seg = (k, opts, cur) => `<div class="seg2 s22" role="group">${opts.map(([v, t]) => `<button data-set22="${k}:${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(t)}</button>`).join("")}</div>`;

  /* ---------- points rows (checkbox per item, select for "0–5" ranges, radio groups for mutually exclusive rows) ---------- */
  function pointsInputs(b, o = {}) {
    const col = o.col || b.cols[0].key, pre = o.pre || "p", groups = o.radio || [], inG = new Map(); groups.forEach((g, gi) => g.forEach(i => inG.set(i, gi)));
    let h = "";
    b.rows.forEach((r, i) => {
      if (r.section) { h += sub(r.section); return; }
      const gi = inG.get(i);
      if (gi != null) { if (groups[gi][0] !== i) return;
        h += `<div class="rg"><div class="rgl">${esc(o.groupTitle?.[gi] || "Choose one")}</div>${radio(`${pre}g${gi}`, "", "", "None of these")}${groups[gi].map(j => radio(`${pre}g${gi}`, j, pm(b.rows[j].pts[col]), b.rows[j].t)).join("")}</div>`; return; }
      const v = r.pts[col];
      if (typeof v === "string") { const m = /(\d+)\s*[–-]\s*(\d+)/.exec(v), hi = m ? +m[2] : 0;
        h += `<div class="cr">${sel(`${pre}${i}`, esc(r.t), Array.from({ length: hi + 1 }, (_, s) => [String(s), o.labels?.[s] != null ? `${s} — ${o.labels[s]}` : String(s)]))}</div>`; return; }
      if (v == null) return;
      h += chk(`${pre}${i}`, r.t, { pts: v, s: r.s });
    });
    return h;
  }
  function ptsTotal(b, o = {}) {
    const col = o.col || b.cols[0].key, pre = o.pre || "p", groups = o.radio || [], inG = new Set(groups.flat());
    let t = 0;
    b.rows.forEach((r, i) => { if (r.section || inG.has(i) || r.pts == null) return; const v = r.pts[col];
      if (typeof v === "string") t += nv(`${pre}${i}`) || 0; else if (v != null && on(`${pre}${i}`)) t += v; });
    groups.forEach((g, gi) => { const s = V()[`${pre}g${gi}`]; if (s !== "" && s != null) t += b.rows[+s].pts[col]; });
    return t;
  }
  // grid whose header is the score (0 1 2 …) and whose rows are the sign + the wording for each score: one radio set per row
  function gridInputs(b, o = {}) {
    const pre = o.pre || "g", scores = b.head.slice(1).map(C.toNum);
    return b.rows.map((r0, ri) => { const r = r0.cells || r0;
      return `<fieldset class="rg ${scores.length > 3 ? "compact" : ""}"><legend class="rgl">${esc(r[0])}</legend>${scores.map((s, j) => radio(`${pre}${ri}`, s, s, String(r[j + 1]))).join("")}</fieldset>`; }).join("");
  }
  const gridTotal = (b, pre = "g") => b.rows.reduce((a, _, ri) => a + (nv(`${pre}${ri}`) || 0), 0);
  const gridPicked = (b, pre = "g") => b.rows.filter((_, ri) => V()[`${pre}${ri}`] != null && V()[`${pre}${ri}`] !== "").length;

  /* ---------- read-only reference blocks (every left / right block, as printed on the card) ---------- */
  function refBlock(b) {
    const T = `<h2 class="ctitle">${esc(b.title || "")}${b.s ? plus(b.s) : ""}</h2>`;
    const item = it => { const c = note(it);
      return `<li class="${it.level ? "bnd l-" + LV(it.level) : ""}"><div class="body"><span class="txt">${it.b ? `<b>${esc(it.b)}</b> ` : ""}${esc(it.t || "")}${plus(it.s)}${c.btn}</span>${c.txt}</div></li>`; };
    let body = "";
    if (b.type === "list" || b.type === "stg") body = `<ul class="items sl">${b.items.map(item).join("")}</ul>`;
    else if (b.type === "bands") body = `<div class="pin">${bandsRes(b.items, -1)}</div>`;
    else if (b.type === "formula") body = `<div class="fms">${b.items.map(f => `<div class="fm"><div class="fh"><b>${esc(f.name)}</b>${plus(f.s)}</div><div class="fx">${esc(f.expr)}</div>${f.notes || f.units ? `<div class="fmeta">${[f.units, f.notes].filter(Boolean).map(esc).join(" · ")}</div>` : ""}</div>`).join("")}</div>`;
    else if (b.type === "steps") body = `<div class="pin">${b.items.map(it => `<div class="sstep l-${LV(it.level)}"><b>${esc(it.if)}</b>${plus(it.s)}<ol>${it.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join("")}</div>`;
    else if (b.type === "points") body = `<div class="tscroll"><table class="dtab sgrid"><thead><tr><th>${esc(b.head || "")}</th>${b.cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => r.section
      ? `<tr class="sec"><th colspan="${b.cols.length + 1}">${esc(r.section)}</th></tr>` : `<tr><th>${esc(r.t)}${plus(r.s)}</th>${b.cols.map(c => `<td>${r.pts[c.key] == null ? "—" : esc(typeof r.pts[c.key] === "number" ? pm(r.pts[c.key]) : r.pts[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    else if (b.type === "grid") { const cell = (c, first) => { const o = (c && typeof c === "object") ? c : { v: c }; return `<${first && b.first_bold !== false ? "th" : "td"} class="${o.level ? "gl-" + LV(o.level) : ""}">${esc(o.v ?? "")}</${first && b.first_bold !== false ? "th" : "td"}>`; };
      body = `<div class="tscroll"><table class="dtab sgrid"><thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r0 => { if (r0.section) return `<tr class="sec"><th colspan="${b.head.length}">${esc(r0.section)}</th></tr>`;
        const cells = r0.cells || r0; return `<tr class="${r0.level ? "gl-" + LV(r0.level) : ""}">${cells.map((c, i) => cell(c, i === 0)).join("")}</tr>`; }).join("")}</tbody></table></div>`; }
    return `<section class="card">${T}${body}</section>`;
  }

  /* ---------- the 22 calculators ---------- */
  const SPEC = {};
  const simple = ({ pts = "left.0", bands = "right.0", label, max, radio, groupTitle, col }) => ({
    skip: [pts, bands],
    ui: d => pointsInputs(blk(d, pts), { radio: radio?.(d), groupTitle, col }),
    calc: d => { const b = blk(d, pts), o = { radio: radio?.(d), col }, t = ptsTotal(b, o), items = blk(d, bands).items, i = C.bandIdx(items, t);
      return { bar: [{ label, value: pm(t).replace(/^\+/, ""), sub: "/ " + max, chips: i >= 0 ? [chipOf(items[i])] : [] }], html: bandsRes(items, i) }; },
  });

  SPEC.alvarado = simple({ label: "Alvarado", max: "0–10" });

  SPEC.apgar = { skip: ["left.0", "right.0"],
    ui: d => ["1 minute|a1", "5 minutes|a5"].map(x => { const [t, p] = x.split("|"); return panel("Apgar at " + t, gridInputs(blk(d, "left.0"), { pre: p })); }).join(""),
    calc: d => { const g = blk(d, "left.0"), items = blk(d, "right.0").items, stg = blk(d, "right.1").items;
      const one = p => { const t = gridTotal(g, p), n = gridPicked(g, p), i = n ? C.bandIdx(items, t) : -1; return { t, n, i }; };
      const a = one("a1"), b = one("a5"), refer = stg.find(x => x.s === "PHC:6.27"), flow = stg.find(x => x.s === "MAT24:74");
      let html = bandsRes(items, b.n ? b.i : a.i, "Interpretation (highlighted for the 5-minute score when entered)");
      if (b.n === g.rows.length && b.t < 8 && refer) html += banner("red", refer.t, refer.s);
      if (b.n === g.rows.length && b.t < 7 && flow) html += banner("red", flow.t, flow.s);
      return { bar: [{ label: "1 min", value: String(a.t), sub: "/ 10", chips: a.n ? [chipOf(items[a.i])] : [] }, { label: "5 min", value: String(b.t), sub: "/ 10", chips: b.n ? [chipOf(items[b.i])] : [] }], html }; },
    check: d => { const w = []; if (blk(d, "left.0").rows.length !== 5) w.push("APGAR grid should have 5 signs"); return w; } };

  SPEC.ipss = { skip: ["left.0", "left.1", "left.2", "right.0"],
    ui: d => { const lab = blk(d, "left.0").rows[0].slice(1), qol = blk(d, "left.2");
      return pointsInputs(blk(d, "left.1"), { labels: lab }) + sub(qol.title) + sel("qol", "Quality of life if the symptoms stayed like this", qol.head.map((h, i) => [h, `${h} — ${qol.rows[0][i]}`])); },
    calc: d => { const t = ptsTotal(blk(d, "left.1")), items = blk(d, "right.0").items, i = C.bandIdx(items, t), q = V().qol;
      return { bar: [{ label: "IPSS", value: String(t), sub: "/ 0–35", chips: [chipOf(items[i])] }], html: bandsRes(items, i) + (q !== "" && q != null ? `<p class="hint">Quality of life (scored separately, not added to the total): <b>${esc(q)}</b></p>` : "") }; } };

  SPEC.curb65 = { skip: ["left.0", "left.1", "left.2"],
    ui: d => panel("Optional: type the values and the items tick themselves", `<div class="ngrid">${num("urea", "Urea", "mmol/L")}${num("rr", "Resp. rate", "/min")}${num("sbp", "Systolic BP", "mmHg")}${num("dbp", "Diastolic BP", "mmHg")}${num("age", "Age", "years")}</div>`)
      + panel(blk(d, "left.0").title, blk(d, "left.0").rows.map((r, i) => chk("p" + i, r.t, { s: r.s })).join(""), blk(d, "left.0").s),
    sync: k => { const f = C.curbFlags({ urea: nv("urea"), rr: nv("rr"), sbp: nv("sbp"), dbp: nv("dbp"), age: nv("age") });
      const m = { urea: [1, f.urea], rr: [2, f.rr], sbp: [3, f.bp], dbp: [3, f.bp], age: [4, f.age] }[k];
      if (m && Number.isFinite(nv(k))) { V()["p" + m[0]] = m[1]; const e = $(`[data-k="p${m[0]}"]`); if (e) e.checked = m[1]; } },
    calc: d => { const b = blk(d, "left.0"), tot = key => b.rows.reduce((a, r, i) => a + (on("p" + i) ? (r.pts[key] || 0) : 0), 0);
      const c = tot("c"), r = tot("r"), bc = blk(d, "left.1"), br = blk(d, "left.2"), ic = C.bandIdx(bc.items, c), ir = C.bandIdx(br.items, r);
      return { bar: [{ label: "CURB-65", value: String(c), sub: "/ 5", chips: [chipOf(bc.items[ic])] }, { label: "CRB-65", value: String(r), sub: "/ 4", chips: [chipOf(br.items[ir])] }],
        html: bandsRes(bc.items, ic, bc.title) + bandsRes(br.items, ir, br.title) }; } };

  SPEC.phq9 = { skip: ["left.0", "left.1", "right.0", "right.1"],
    ui: d => pointsInputs(blk(d, "left.1"), { labels: blk(d, "left.0").rows[0] }),
    calc: d => { const t = ptsTotal(blk(d, "left.1")), items = blk(d, "right.0").items, i = C.bandIdx(items, t), q9 = nv("p8"), it9 = blk(d, "right.1").items[0];
      return { bar: [{ label: "PHQ-9", value: String(t), sub: "/ 0–27", chips: [chipOf(items[i])] }], html: (q9 >= 1 ? banner(it9.level, `${it9.label}: ${it9.t}`, it9.s) : "") + bandsRes(items, i, "Severity") }; } };

  SPEC.csrs = simple({ label: "CSRS", max: "−3 to 11", groupTitle: ["Diagnosis in casualty"],
    radio: d => { const r = blk(d, "left.0").rows, a = r.findIndex(x => /^Vasovagal syncope/.test(x.t || "")), b = r.findIndex(x => /^Cardiac syncope/.test(x.t || "")); return [[a, b]]; } });

  SPEC.caprini = { skip: ["left.0", "left.1"],
    ui: d => { const g = blk(d, "left.0").rows.map(r0 => { const r = r0.cells || r0; return { pts: C.toNum(r[0]), fs: String(r[1]).split(" · "), level: r0.level, s: r0.s }; });
      const ages = g.flatMap((x, ri) => x.fs.map((f, j) => ({ f, j, ri, pts: x.pts })).filter(a => /^Age\b/.test(a.f)));
      return panel("Age (choose one band)", `<div class="rg">${radio("age", "", "", "None of these (≤40 y)")}${ages.map(a => radio("age", `${a.ri}_${a.j}`, pm(a.pts), a.f)).join("")}</div>`)
        + g.map((x, ri) => `<section class="card"><h2 class="ctitle"><span class="ptbnd l-${LV(x.level)}">${x.pts} point${x.pts === 1 ? "" : "s"} each</span>${plus(x.s)}</h2><div class="pin">`
          + x.fs.map((f, j) => /^Age\b/.test(f) ? "" : chk(`f${ri}_${j}`, f)).join("") + `</div></section>`).join(""); },
    calc: d => { const g = blk(d, "left.0").rows; let t = 0;
      g.forEach((r0, ri) => { const r = r0.cells || r0, pts = C.toNum(r[0]); String(r[1]).split(" · ").forEach((f, j) => { if (!/^Age\b/.test(f) && on(`f${ri}_${j}`)) t += pts; }); });
      const a = V().age; if (a) { const [ri] = String(a).split("_"); t += C.toNum((g[+ri].cells || g[+ri])[0]); }
      const items = blk(d, "left.1").items, i = C.bandIdx(items, t);
      return { bar: [{ label: "Caprini", value: String(t), sub: "", chips: [chipOf(items[i])] }], html: bandsRes(items, i, "Risk (total)") }; } };

  SPEC.ugib = { tabs: [["gbs", "Glasgow-Blatchford"], ["rockall", "Pre-endoscopy Rockall"]],
    skip: ["left.0", "left.1", "right.0", "right.1"], only: ["right.2"],
    ui: (d, tab) => { if (tab === "rockall") return pointsInputs(blk(d, "right.0"), { pre: "r", radio: ROCK(d), groupTitle: ["Age", "Shock", "Comorbidity"] });
      const b = blk(d, "left.0"), sec = i => b.rows.findIndex(r => r.section && r.section.startsWith(i)), other = sec("Other");
      return panel("Enter the admission values — rows score themselves", `<div class="ngrid">${num("urea", "Blood urea", "mmol/L")}${num("hb", "Haemoglobin", "g/dL")}${num("sbp", "Systolic BP", "mmHg")}${num("pulse", "Pulse", "/min")}</div>`
        + `<div class="rg"><div class="rgl">Sex (for haemoglobin)</div>${radio("sex", "M", "", "Man")}${radio("sex", "F", "", "Woman")}</div>`) + panel("Other markers", b.rows.slice(other + 1).filter(r => !/^Pulse/.test(r.t)).map((r, j) => chk("o" + j, r.t, { pts: r.pts.p, s: r.s })).join("")); },
    calc: (d, tab) => { if (tab === "rockall") { const b = blk(d, "right.0"), t = ptsTotal(b, { pre: "r", radio: ROCK(d) }), items = blk(d, "right.1").items, i = C.bandIdx(items, t);
        return { bar: [{ label: "Rockall (pre-endoscopy)", value: String(t), sub: "/ 0–7", chips: [chipOf(items[i])] }], html: bandsRes(items, i) }; }
      const b = blk(d, "left.0"), si = k => b.rows.findIndex(r => r.section && r.section.startsWith(k)), A = C.gbsAuto({ urea: nv("urea"), hb: nv("hb"), male: V().sex === "M", sbp: nv("sbp") });
      const pick = (k, j, n) => j < 0 ? null : b.rows[si(k) + 1 + j], rows = [pick("Blood urea", A.U), V().sex ? pick("Haemoglobin", A.H) : null, pick("Systolic", A.S)].filter(Boolean);
      const others = b.rows.slice(si("Other") + 1), pulse = others.find(r => /^Pulse/.test(r.t)), manual = others.filter(r => !/^Pulse/.test(r.t));
      let t = rows.reduce((a, r) => a + r.pts.p, 0) + (nv("pulse") >= 100 && pulse ? pulse.pts.p : 0) + manual.reduce((a, r, j) => a + (on("o" + j) ? r.pts.p : 0), 0);
      const items = blk(d, "left.1").items, i = C.bandIdx(items, t);
      const why = [...rows.map(r => `${r.t} (+${r.pts.p})`), ...(nv("pulse") >= 100 && pulse ? [`${pulse.t} (+${pulse.pts.p})`] : [])];
      return { bar: [{ label: "Glasgow-Blatchford", value: String(t), sub: "/ 0–23", chips: [chipOf(items[i])] }], html: bandsRes(items, i) + (why.length ? `<p class="hint">Scored from the values: ${why.map(esc).join(" · ")}</p>` : "") }; } };
  const ROCK = d => { const b = blk(d, "right.0"), g = []; let cur = null; b.rows.forEach((r, i) => { if (r.section) { cur = []; g.push(cur); } else if (cur) cur.push(i); }); return g; };

  SPEC.grace = { skip: ["left.0", "left.1", "right.0"],
    ui: d => { const t = C.buildGrace(d); V().acs ||= t.risk[0].name;
      return panel("Admission values", `<div class="ngrid">${num("age", "Age", "years")}${num("hr", "Heart rate", "/min")}${num("sbp", "Systolic BP", "mmHg")}${num("creat", "Creatinine", "µmol/L")}</div>`, blk(d, "left.0").s)
        + panel("Killip class", `<div class="rg">${t.killip.map((r, i) => radio("killip", i, pm(r.pts.p).replace("+", ""), r.t)).join("")}</div>`, blk(d, "left.1").s)
        + panel("Other findings", t.flags.map((r, i) => chk("fl" + i, r.t, { pts: r.pts.p, s: r.s })).join(""))
        + panel("ACS type (selects the risk table)", `<div class="rg">${t.risk.map(s => radio("acs", s.name, "", s.name)).join("")}</div>`); },
    calc: d => { const t = C.buildGrace(d), r = C.graceCalc(t, { age: nv("age"), hr: nv("hr"), sbp: nv("sbp"), creat: nv("creat"), killip: nv("killip") || 0, flags: t.flags.map((_, i) => on("fl" + i)) });
      const type = V().acs || t.risk[0].name, rk = C.graceRisk(t, type, r.total), head = t.riskHead;
      const rows = rk.map(x => `<tr><th>${esc(x.label)}</th>${x.cells.map((c, j) => `<td class="${r.complete && x.idx === j ? "hit gl-" + ["green", "amber", "red"][j] : ""}">${esc(c)}</td>`).join("")}</tr>`).join("");
      const hosp = rk[0], chip = r.complete && hosp && hosp.idx >= 0 ? [{ t: `${type} · ${hosp.label}: ${head[hosp.idx + 1]}`, level: ["green", "amber", "red"][hosp.idx] }] : [];
      const parts = t.cols.map((c, i) => `${c.name.replace(/\s*\(.*\)/, "").replace(/\s*µmol\/L$/, "")} ${r.parts[i] ?? "—"}`).join(" · ");
      return { bar: [{ label: "GRACE", value: r.complete ? String(r.total) : String(r.total) + "+", sub: r.complete ? "points" : "enter all four values", chips: chip }],
        html: `<p class="hint">${esc(parts)} · Killip ${r.killip} · other findings ${r.flags}</p><h3 class="sub22">${esc(blk(d, "right.0").title)} — ${esc(type)}</h3><div class="tscroll"><table class="dtab sgrid"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` }; } };

  SPEC["chest-pain"] = { tabs: [["heart", "HEART"], ["tmacs", "T-MACS"]],
    skip: ["left.0", "left.1", "right.0", "right.1", "right.2"], only: tab => tab === "heart" ? ["left.2", "right.3"] : ["right.3"],
    ui: (d, tab) => tab === "heart" ? gridInputs(blk(d, "left.0"), { pre: "h" })
      : panel(blk(d, "right.0").title, blk(d, "right.0").items.map((r, i) => chk("tm" + i, r.t, { s: r.s })).join(""), blk(d, "right.0").s),
    calc: (d, tab) => { if (tab === "heart") { const g = blk(d, "left.0"), t = gridTotal(g, "h"), items = blk(d, "left.1").items, i = C.bandIdx(items, t);
        return { bar: [{ label: "HEART", value: String(t), sub: "/ 0–10", chips: gridPicked(g, "h") ? [chipOf(items[i])] : [] }], html: bandsRes(items, gridPicked(g, "h") ? i : -1, blk(d, "left.1").title) }; }
      const note_ = blk(d, "right.2").items;
      return { bar: [{ label: "T-MACS", value: "—", sub: "no equation here", chips: [] }],
        html: banner("amber", "Equation not included (coefficients unverified) — use the official T-MACS calculator") + bandsRes(blk(d, "right.1").items, -1, blk(d, "right.1").title)
          + `<ul class="items sl">${note_.map(n => `<li><div class="body"><span class="txt">${esc(n.t)}${plus(n.s)}</span></div></li>`).join("")}</ul>` }; } };

  SPEC.sofa = { tabs: [["sofa", "SOFA"], ["qsofa", "qSOFA"]],
    skip: ["left.0", "right.0"], only: tab => tab === "sofa" ? ["left.1", "right.1", "right.2"] : ["right.1", "right.2"],
    ui: (d, tab) => { if (tab === "qsofa") return panel("qSOFA — 1 point each", `<div class="ngrid">${num("rr", "Resp. rate", "/min")}${num("sbp", "Systolic BP", "mmHg")}</div>`
        + chk("q0", "Respiratory rate ≥22/min") + chk("q1", "Altered mentation (GCS <15)") + chk("q2", "Systolic BP ≤100 mmHg"));
      const g = blk(d, "left.0");
      return gridInputs(g, { pre: "s" }) + panel("Baseline, sepsis and septic shock",
        `<div class="ngrid">${num("base", "Baseline SOFA (blank = 0)", "", { step: 1 })}${num("sbp2", "Systolic BP", "mmHg")}${num("dbp2", "Diastolic BP", "mmHg")}</div>`
        + chk("shock1", "Vasopressor needed to keep MAP ≥65 mmHg despite fluids") + chk("shock2", "Lactate >2 mmol/L despite adequate fluids")); },
    sync: k => { if (k === "rr") { V().q0 = nv("rr") >= 22; const e = $('[data-k="q0"]'); if (e) e.checked = V().q0; } if (k === "sbp") { V().q2 = nv("sbp") <= 100; const e = $('[data-k="q2"]'); if (e) e.checked = V().q2; } },
    calc: (d, tab) => { if (tab === "qsofa") { const n = [on("q0"), on("q1"), on("q2")].filter(Boolean).length, items = blk(d, "right.0").items, i = n >= 2 ? 0 : 1;
        return { bar: [{ label: "qSOFA", value: String(n), sub: "/ 3", chips: [chipOf(items[i])] }], html: bandsRes(items, i, "qSOFA (bedside screen)") }; }
      const g = blk(d, "left.0"), t = gridTotal(g, "s"), n = gridPicked(g, "s"), base = Number.isFinite(nv("base")) ? nv("base") : 0, delta = t - base, f = blk(d, "left.1").items;
      const map = Number.isFinite(nv("sbp2")) && Number.isFinite(nv("dbp2")) ? C.mapOf(nv("sbp2"), nv("dbp2")) : NaN, shock = on("shock1") && on("shock2");
      return { bar: [{ label: "SOFA", value: String(t), sub: `/ 24 · ${n}/6 systems`, chips: [...(n && delta >= 2 ? [{ t: "ΔSOFA ≥2: Sepsis", level: "red" }] : []), ...(shock ? [{ t: "Septic shock", level: "red" }] : [])] }],
        html: (n && delta >= 2 ? banner("red", `${f[1].name}: ${f[1].expr} — ΔSOFA = ${delta}`, f[1].s) : n ? banner("green", `ΔSOFA = ${delta} (<2)`) : "")
          + (shock ? banner("red", `${f[2].name}: ${f[2].expr}`, f[2].s) : "") + (Number.isFinite(map) ? `<p class="hint">MAP = (SBP + 2 × DBP) ÷ 3 = <b>${f1(map)} mmHg</b> (${map >= 65 ? "≥65" : "<65"})</p>` : "") }; } };

  SPEC.framingham = { skip: ["left.0", "left.1", "right.0"], only: null,
    ui: d => panel("Patient", `<div class="rg"><div class="rgl">Sex</div>${radio("sex", "M", "", "Man")}${radio("sex", "F", "", "Woman")}</div><div class="ngrid">${num("age", "Age", "years (30–79)")}${num("tc", "Total cholesterol", "mmol/L")}${num("hdl", "HDL cholesterol", "mmol/L")}${num("sbp", "Systolic BP", "mmHg")}</div>`
      + chk("treated", "Systolic BP is on treatment") + chk("smoker", "Smoker") + chk("diabetic", "Diabetic"), blk(d, "left.0").s),
    calc: d => { const t = C.buildFramingham(d), r = C.framinghamCalc(t, { female: V().sex === "F", age: nv("age"), tc: nv("tc"), hdl: nv("hdl"), sbp: nv("sbp"), treated: on("treated"), smoker: on("smoker"), diabetic: on("diabetic") });
      const m = blk(d, "right.0").items;
      if (!V().sex || !r.ok) return { bar: [{ label: "Framingham", value: V().sex ? String(r.total) + "+" : "—", sub: "enter sex, age, cholesterol, HDL and SBP", chips: [] }], html: `<p class="hint">Age must be 30–79 years.</p>` };
      const p = r.parts, txt = `Age ${pm(p.age).replace("+", "")} · cholesterol ${pm(p.tc).replace("+", "")} · HDL ${pm(p.hdl).replace("+", "")} · SBP ${pm(p.sbp).replace("+", "")} · smoker ${p.smoker} · diabetic ${p.diabetic}`;
      const hdlFlag = t.hdl[r.idx.hdl].flag ? ` <button class="cor c22" data-c22>‡</button><div class="cnote" hidden>${esc(blk(d, "left.3").items.find(x => x.c)?.c || "")}</div>` : "";
      return { bar: [{ label: "10-year CVD risk", value: (r.beyond && !/^[<>]/.test(r.riskText) ? "≥" : "") + r.riskText + "%", sub: `${r.total} points`, chips: r.mgmt >= 0 ? [chipOf(m[r.mgmt])] : [] }],
        html: `<p class="hint">${esc(txt)} = <b>${r.total}</b> points${hdlFlag}</p>` + (r.mgmt >= 0 ? bandsRes(m, r.mgmt, blk(d, "right.0").title) : "") }; } };

  SPEC["ottawa-ankle"] = { skip: ["left.0", "left.1", "right.0"],
    ui: d => ["left.0", "left.1"].map((id, bi) => { const b = blk(d, id); return panel(b.title, b.items[0].steps.map((s, j) => chk(`o${bi}_${j}`, s)).join(""), b.s); }).join(""),
    calc: d => { const items = blk(d, "right.0").items, sec = [0, 1].map(bi => ({ name: blk(d, "left." + bi).items[0].if, pos: blk(d, "left." + bi).items[0].steps.some((_, j) => on(`o${bi}_${j}`)) }));
      const any = sec.some(s => s.pos), i = any ? 0 : 1, touched = $$("[data-k^='o']").some(e => e.checked);
      return { bar: [{ label: "Ottawa", value: any ? "X-ray" : "No X-ray", sub: "", chips: [{ t: items[i].t.split(" — ")[0], level: items[i].level }] }],
        html: sec.map(s => banner(s.pos ? "red" : "green", `${s.name}: ${s.pos ? "X-ray indicated" : "no criterion met"}`)).join("") + bandsRes(items, i) }; } };

  const PEC = (d, age) => { const g = blk(d, "left.0").rows, col = age === "u2" ? 1 : 2;
    const split = (s, rx) => String(s).split(rx).map(x => x.trim()).filter(Boolean);
    return { high: split(g[0].cells[col], /,?\s+OR\s+/), inter: split(g[1].cells[col], /,\s+or\s+|,\s+/), rows: g }; };
  SPEC.pecarn = { skip: ["left.0"],
    ui: d => { const age = V().age || "u2", p = PEC(d, age), g = p.rows;
      return panel("Age", `<div class="seg2 s22">${[["u2", "<2 years"], ["o2", "≥2 years"]].map(([v, t]) => `<button data-set22="age:${v}" aria-pressed="${age === v}">${t}</button>`).join("")}</div>`)
        + panel(`${g[0].cells[0]} risk — ${age === "u2" ? "<2 y" : "≥2 y"}`, p.high.map((t, j) => chk(`hi_${age}_${j}`, t)).join(""), g[0].s)
        + panel(`${g[1].cells[0]} risk — ${age === "u2" ? "<2 y" : "≥2 y"}`, p.inter.map((t, j) => chk(`in_${age}_${j}`, t)).join(""), g[1].s); },
    calc: d => { const age = V().age || "u2", p = PEC(d, age), h = p.high.filter((_, j) => on(`hi_${age}_${j}`)).length, m = p.inter.filter((_, j) => on(`in_${age}_${j}`)).length;
      const cls = C.pecarnClass({ high: h, inter: m }), row = p.rows[{ high: 0, intermediate: 1, low: 2 }[cls]];
      return { bar: [{ label: "PECARN", value: row.cells[0], sub: "", chips: [{ t: row.cells[3], level: row.level }] }],
        html: banner(row.level, `${row.cells[0]}: ${row.cells[3]}`, row.s) + `<p class="hint">${row.cells[0] === "Low" ? esc(row.cells[age === "u2" ? 1 : 2]) : ""}</p>` }; } };

  SPEC["duke-ie"] = { skip: ["left.0", "left.1", "right.0"],
    ui: d => panel(blk(d, "left.0").title, blk(d, "left.0").items.map((it, j) => chk("ma" + j, `${it.b} ${it.t}`)).join(""), blk(d, "left.0").s)
      + panel(blk(d, "left.1").title, blk(d, "left.1").items.map((it, j) => chk("mi" + j, it.t)).join(""), blk(d, "left.1").s)
      + panel("Pathological criteria", chk("path", "Organisms in vegetation / embolus / intracardiac abscess, or histology of active endocarditis")),
    calc: d => { const mj = blk(d, "left.0").items.filter((_, j) => on("ma" + j)).length, mn = blk(d, "left.1").items.filter((_, j) => on("mi" + j)).length, cls = C.dukeClass({ major: mj, minor: mn, path: on("path") });
      const items = blk(d, "right.0").items, i = { definite: 0, possible: 1, rejected: 2 }[cls];
      return { bar: [{ label: "Modified Duke", value: cls === "rejected" ? "Not met" : items[i].label, sub: `${mj} major · ${mn} minor${on("path") ? " · pathology" : ""}`, chips: [chipOf(items[i])] }],
        html: bandsRes(items, i) + (cls === "rejected" ? `<p class="hint">Criteria for Definite or Possible IE are not met. Reject the diagnosis only with a firm alternative diagnosis (see above).</p>` : "") }; } };

  SPEC.lights = { skip: ["left.1"],
    ui: () => panel("Pleural fluid and serum (paired samples)", `<div class="ngrid">${num("pp", "Pleural protein", "g/L")}${num("sp", "Serum protein", "g/L")}${num("pl", "Pleural LDH", "U/L")}${num("sl", "Serum LDH", "U/L")}${num("uln", "Serum LDH upper limit of normal", "U/L")}</div>`),
    calc: d => { const r = C.lights({ pProt: nv("pp"), sProt: nv("sp"), pLdh: nv("pl"), sLdh: nv("sl"), ldhUln: nv("uln") }), f = blk(d, "left.0").items, items = blk(d, "left.1").items;
      const tick = (c, ok) => c == null ? "" : `<span class="${ok ? "yes" : "no"}">${ok ? "✓" : "✗"}</span>`;
      const row = (i, val, ok) => `<div class="lrow"><span>${tick(true, ok)} <b>${esc(f[i].name)}</b> — ${esc(f[i].expr)}${plus(f[i].s)}</span><span class="lv">${Number.isFinite(val) ? Math.round(val * 100) / 100 : "—"}</span></div>`;
      const enough = [r.proteinRatio, r.ldhRatio].some(Number.isFinite) || Number.isFinite(nv("pl") / nv("uln")), i = r.exudate ? 0 : 1;
      return { bar: [{ label: "Light's criteria", value: enough ? (r.exudate ? "Exudate" : "Transudate") : "—", sub: "", chips: enough ? [chipOf(items[i])] : [] }],
        html: row(0, r.proteinRatio, r.c1) + row(1, r.ldhRatio, r.c2) + row(2, nv("pl") / nv("uln"), r.c3) + (enough ? bandsRes(items, i) : "") }; } };

  SPEC["copd-gold"] = { skip: ["left.1", "left.2", "left.3"], only: null,
    ui: d => { const mm = blk(d, "left.2");
      return panel("Spirometry", `<div class="ngrid">${num("ratio", "Post-bronchodilator FEV₁/FVC", "", { step: 0.01 })}${num("fev1", "FEV₁", "% predicted")}</div>`, blk(d, "left.0").items[0].s)
        + panel("Symptoms and exacerbations (group A / B / E)", sel("mmrc", "mMRC dyspnoea grade", mm.rows.map(r => [r[0], `${r[0]} — ${r[1]}`])) + `<div class="ngrid">${num("exac", "Exacerbations in the past year", "", { step: 1 })}</div>` + chk("hosp", "At least one exacerbation led to hospital admission"), blk(d, "left.3").s); },
    calc: d => { const grades = blk(d, "left.1").rows, labels = grades.map(r => (r.cells || r)[2]), gi = C.pickRange(labels, nv("fev1")), obs = nv("ratio") < 0.70, n = nv("mmrc");
      const gr = gi >= 0 ? grades[gi] : null, grp = Number.isFinite(n) && V().mmrc !== "" ? C.goldGroup({ mmrc: n, exacerbations: nv("exac") || 0, hospitalised: on("hosp") }) : null;
      const stg = blk(d, "right.0").items, use = it => /^All:/.test(it.t) || (grp === "B" && /^Group B:/.test(it.t)) || (grp === "E" && /^Group E:/.test(it.t));
      const chips = [...(gr ? [{ t: `GOLD ${(gr.cells || gr)[0]} · ${(gr.cells || gr)[1]}`, level: gr.level }] : []), ...(grp ? [{ t: `Group ${grp}`, level: { A: "green", B: "amber", E: "red" }[grp] }] : [])];
      return { bar: [{ label: "COPD", value: gr ? `GOLD ${(gr.cells || gr)[0]}` : "—", sub: grp ? `Group ${grp}` : "", chips }],
        html: (Number.isFinite(nv("ratio")) ? banner(obs ? "amber" : "green", obs ? "FEV₁/FVC <0.70: airflow obstruction confirmed" : "FEV₁/FVC ≥0.70: no airflow obstruction — COPD not confirmed", blk(d, "left.0").items[0].s) : "")
          + `<h3 class="sub22">${esc(blk(d, "right.0").title)}${grp ? ` — Group ${grp}` : ""}</h3><ul class="items sl">${stg.map(it => `<li class="bnd l-${LV(it.level)} ${grp && use(it) ? "act" : ""}"><div class="body"><span class="txt">${esc(it.t)}${plus(it.s)}</span></div></li>`).join("")}</ul>` }; } };

  SPEC.liver = { tabs: [["r", "R factor"], ["kings", "King's College"]],
    skip: tab => tab === "r" ? ["left.0", "left.1", "left.2", "right.0"] : ["left.0", "left.1", "left.2", "right.0"], only: tab => tab === "r" ? ["left.0"] : ["right.1"],
    ui: (d, tab) => { if (tab === "r") return panel("Liver tests", `<div class="ngrid">${num("alt", "ALT", "U/L")}${num("altu", "ALT upper limit of normal", "U/L")}${num("alp", "ALP", "U/L")}${num("alpu", "ALP upper limit of normal", "U/L")}</div>`, blk(d, "left.0").items[0].s);
      const par = V().apap || "p", s = blk(d, "right.0").items;
      return panel("Cause", `<div class="seg2 s22">${[["p", "Paracetamol"], ["n", "Non-paracetamol"]].map(([v, t]) => `<button data-set22="apap:${v}" aria-pressed="${par === v}">${t}</button>`).join("")}</div>`)
        + (par === "p" ? panel(s[0].if + " — criteria", `<div class="ngrid">${num("ph", "Arterial pH (after fluids)", "")}${num("inr", "INR", "")}${num("cr", "Creatinine", "µmol/L")}${num("l4", "Lactate at 4 h", "mmol/L")}${num("lf", "Lactate after fluids", "mmol/L")}</div>${chk("enc", "Grade III–IV encephalopathy")}`, s[0].s)
          : panel(s[1].if + " — criteria", `<div class="ngrid">${num("age", "Age", "years")}${num("inr", "INR", "")}${num("bili", "Bilirubin", "µmol/L")}</div>${chk("aet", "Non-A non-B hepatitis or drug-induced")}${chk("jd", "Jaundice → encephalopathy more than 7 days")}`, s[1].s)); },
    calc: (d, tab) => { if (tab === "r") { const r = C.liverPattern({ alt: nv("alt"), altUln: nv("altu"), alp: nv("alp"), alpUln: nv("alpu") }), items = blk(d, "left.1").items, adv = blk(d, "left.2").items;
        if (r.pattern == null) return { bar: [{ label: "R factor", value: "—", sub: "enter all four values", chips: [] }], html: "" };
        const idx = { hepatocellular: 0, mixed: 1, cholestatic: 2, below: -1 }[r.pattern], ai = C.altAdvice(r.altX);
        return { bar: [{ label: "R factor", value: f1(r.r), sub: `ALT ${f1(r.altX)}× · ALP ${f1(r.alpX)}× ULN`, chips: [idx >= 0 ? chipOf(items[idx]) : { t: "Below the DILI pattern thresholds", level: "grey" }] }],
          html: bandsRes(items, idx, blk(d, "left.1").title) + `<h3 class="sub22">${esc(blk(d, "left.2").title)} — ALT ${f1(r.altX)} × ULN</h3><ul class="items sl">${adv.map((it, i) => `<li class="bnd l-${LV(it.level)} ${i === ai ? "act" : ""}"><div class="body"><span class="txt">${esc(it.t)}${plus(it.s)}</span></div></li>`).join("")}</ul>` }; }
      const par = V().apap || "p", s = blk(d, "right.0").items;
      if (par === "p") { const k = C.kingsParacetamol({ ph: nv("ph"), inr: nv("inr"), creat: nv("cr"), grade34: on("enc"), lactate4h: nv("l4"), lactateFluids: nv("lf") });
        return { bar: [{ label: "King's (paracetamol)", value: k.meets ? "Meets" : "Not met", sub: "", chips: k.meets ? [{ t: "Refer for transplant", level: "red" }] : [] }],
          html: (k.meets ? banner("red", "Meets King's criteria — refer for transplant", s[0].s) : banner("green", "King's criteria not met on these values — reassess; discuss any doubt with a specialist"))
            + `<ul class="items sl">${[[k.a, s[0].steps[0]], [k.b, s[0].steps[1]], [k.mod, s[0].steps[2]]].map(([ok, t]) => `<li><div class="body"><span class="txt"><span class="${ok ? "yes" : "no"}">${ok ? "✓" : "✗"}</span> ${esc(t)}</span></div></li>`).join("")}</ul>` }; }
      const k = C.kingsNonParacetamol({ age: nv("age"), inr: nv("inr"), bili: nv("bili"), aetiology: on("aet"), jaundiceEnceph7: on("jd") });
      return { bar: [{ label: "King's (non-paracetamol)", value: k.meets ? "Meets" : "Not met", sub: `${k.count} of 5 · INR >6.5: ${k.inrHigh ? "yes" : "no"}`, chips: k.meets ? [{ t: "Refer for transplant", level: "red" }] : [] }],
        html: (k.meets ? banner("red", "Meets King's criteria — refer for transplant", s[1].s) : banner("green", "King's criteria not met on these values — reassess; discuss any doubt with a specialist"))
          + `<p class="hint">${esc(s[1].steps[0])} (${k.inrHigh ? "yes" : "no"}) · ${k.count} of the 5 listed criteria</p>` }; } };

  SPEC.renal = { skip: ["right.0"], only: null,
    ui: d => panel("Patient", `<div class="rg"><div class="rgl">Sex</div>${radio("sex", "M", "", "Male")}${radio("sex", "F", "", "Female")}</div><div class="ngrid">${num("age", "Age", "years")}${num("scr", "Creatinine", "µmol/L")}${num("kg", "Weight", "kg (Cockcroft-Gault)")}${num("ht", "Height", "cm (Schwartz)")}${num("urea", "Urea", "mmol/L")}${num("uacr", "UACR", "mg/mmol")}</div>${chk("lbw", "Low birth weight <2.5 kg (infant)")}`),
    calc: d => { const age = nv("age"), scr = nv("scr"), female = V().sex === "F", g = blk(d, "right.0"), res = [];
      const ok = Number.isFinite(age) && Number.isFinite(scr) && V().sex;
      let egfr = NaN, which = "", kfoot = "";
      if (ok) { const ep = C.ckdEpi2021({ scrUmol: scr, age, female }), md = C.mdrd({ scrUmol: scr, age, female });
        if (age >= 18) res.push(["CKD-EPI 2021 (adults, STG)", f0(ep), "mL/min/1.73 m²"], ["MDRD (IDMS)", f0(md), "mL/min/1.73 m²"]);
        if (Number.isFinite(nv("kg"))) res.push(["Cockcroft-Gault", f0(C.cockcroftGault({ age, kg: nv("kg"), scrUmol: scr, female })), "mL/min"]);
        if (age < 18) { const k = C.schwartzK({ ageYears: age, female, lbw: on("lbw") });
          if (k.k != null && Number.isFinite(nv("ht"))) { egfr = C.schwartz({ k: k.k, heightCm: nv("ht"), scrUmol: scr }); which = "Schwartz"; res.push([`Schwartz (K ${k.k}, ${k.label})`, f0(egfr), "mL/min/1.73 m²"]); }
          else if (k.k == null) kfoot = `<p class="hint">${esc(k.label)} <button class="cor c22" data-c22>‡</button><div class="cnote" hidden>${esc(blk(d, "left.1").items.find(x => x.c)?.t || "")}</div></p>`; }
        if (!which && age >= 18) { egfr = ep; which = "CKD-EPI"; } }
      if (ok && Number.isFinite(nv("urea"))) { const r = C.ureaCreat({ urea: nv("urea"), scrUmol: scr }); res.push(["Urea:creatinine (SI)", f0(r), "ratio"], ["BUN:Cr (US) ≈", f1(C.bunCr(r)), "ratio"]); }
      const G = Number.isFinite(egfr) ? C.gStage(egfr) : null, A = Number.isFinite(nv("uacr")) ? C.aStage(nv("uacr")) : null, gi = G ? C.G_STAGES.indexOf(G) : -1, ai = A ? +A[1] - 1 : -1;
      const cellLevel = gi >= 0 && ai >= 0 ? (g.rows[gi][ai + 1] || {}) : null;
      const table = `<div class="tscroll"><table class="dtab sgrid"><thead><tr>${g.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${g.rows.map((r, ri) => `<tr><th class="${ri === gi ? "hit" : ""}">${esc(r[0])}</th>${r.slice(1).map((c, ci) => `<td class="gl-${LV(c.level)} ${ri === gi && ci === ai ? "hit" : (ri === gi || ci === ai) ? "dimhit" : ""}">${esc(c.v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      return { bar: [{ label: `eGFR (${which || "—"})`, value: Number.isFinite(egfr) ? f0(egfr) : "—", sub: "mL/min/1.73 m²", chips: [...(G ? [{ t: G, level: "grey" }] : []), ...(A ? [{ t: A, level: "grey" }] : []), ...(cellLevel && cellLevel.v ? [{ t: cellLevel.v.toUpperCase(), level: cellLevel.level }] : [])] }],
        html: `<div class="rtab">${res.map(r => `<div class="lrow"><span>${esc(r[0])}</span><span class="lv"><b>${esc(r[1])}</b> <small>${esc(r[2])}</small></span></div>`).join("")}</div>${kfoot}<h3 class="sub22">${esc(g.title)}${plus(g.s)}</h3>${table}` }; } };

  SPEC.ganzoni = { skip: [], only: null,
    ui: () => panel("Patient", `<div class="ngrid">${num("kg", "Weight", "kg")}${num("hb", "Actual Hb", "g/dL")}${num("target", "Target Hb", "g/dL", { ph: "15" })}${num("stores", "Iron stores", "mg", { ph: "500" })}</div>`
      + `<div class="quick">Target Hb: <button class="btn" data-set22="target:15">15 (default)</button> <button class="btn" data-set22="target:12">12 (pregnancy)</button></div>`),
    calc: d => { const kg = nv("kg"), hb = nv("hb"), tgt = Number.isFinite(nv("target")) ? nv("target") : 15, st = Number.isFinite(nv("stores")) ? nv("stores") : 500, tab = blk(d, "left.2");
      if (Number.isFinite(kg) && kg < 35) return { bar: [{ label: "Iron deficit", value: "—", sub: "<35 kg", chips: [{ t: "Not calculated", level: "amber" }] }], html: banner("amber", "Weight <35 kg: the formula's iron stores (500 mg) do not apply — check the product package insert; not calculated here.") };
      if (!Number.isFinite(kg) || !Number.isFinite(hb)) return { bar: [{ label: "Iron deficit", value: "—", sub: "enter weight and Hb", chips: [] }], html: "" };
      if (hb >= tgt) return { bar: [{ label: "Iron deficit", value: "0", sub: "mg", chips: [{ t: "Hb at or above target", level: "green" }] }], html: banner("green", "Actual Hb is at or above the target: no deficit by this formula.") };
      const mg = C.ganzoni({ kg, hbActual: hb, hbTarget: tgt, stores: st }), doses = C.ironSucroseDoses(mg), row = hb >= 10 ? 0 : 1, col = kg >= 70 ? 2 : kg >= 50 ? 1 : -1;
      const stg = blk(d, "right.0").items;
      return { bar: [{ label: "Total iron deficit", value: f0(mg), sub: "mg", chips: [{ t: `${doses} × 200 mg iron sucrose`, level: "amber" }] }],
        html: `<p class="hint">${f1(kg)} kg × (${f1(tgt)} − ${f1(hb)}) g/dL × 2.4 + ${f0(st)} mg = <b>${f0(mg)} mg</b></p>`
          + `<h3 class="sub22">${esc(tab.title)}${plus(tab.s)}</h3><div class="tscroll"><table class="dtab sgrid"><thead><tr>${tab.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${tab.rows.map((r, ri) => `<tr><th>${esc(r[0])}</th>${r.slice(1).map((c, ci) => `<td class="${ri === row && ci + 1 === col ? "hit gl-amber" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          + (col < 0 ? `<p class="hint">Under 50 kg: not on the simplified table — use the calculated deficit.</p>` : "")
          + `<h3 class="sub22">${esc(blk(d, "right.0").title)}</h3><p class="hint">${esc(stg[0].t)}${plus(stg[0].s)}<br>Calculated deficit ${f0(mg)} mg ÷ 200 mg = <b>${doses}</b> doses of iron sucrose (up to 3 per week).</p>` }; } };

  SPEC["burns-adult"] = { skip: ["right.1"], only: null,
    ui: d => panel("Patient", `<div class="ngrid">${num("kg", "Weight", "kg")}${num("tbsa", "Burn area", "% TBSA")}${num("h", "Hours since the burn", "h (optional)")}${num("age", "Age", "years (optional)")}</div>`)
      + panel(blk(d, "right.1").title, blk(d, "right.1").items.map((it, j) => chk("rf" + j, it.t, { s: it.s })).join(""), null),
    calc: d => { const kg = nv("kg"), t = nv("tbsa"), h = nv("h") || 0, f = blk(d, "left.0").items, ors = blk(d, "right.0").items.find(x => /≤10%/.test(x.t));
      const refer = blk(d, "right.1").items.filter((_, j) => on("rf" + j)).length > 0 || (t > 15) || (t > 10 && nv("age") > 50);
      const rb = refer ? banner("red", "Discuss with a burns specialist" + (t > 15 || (t > 10 && nv("age") > 50) ? " (TBSA threshold met)" : ""), blk(d, "right.1").items[0].s) : "";
      if (!Number.isFinite(kg) || !Number.isFinite(t)) return { bar: [{ label: "Parkland 24 h", value: "—", sub: "enter weight and %TBSA", chips: [] }], html: rb };
      if (t <= 10) return { bar: [{ label: "Parkland 24 h", value: "ORS", sub: "≤10% TBSA", chips: [{ t: "Oral rehydration solution", level: "green" }] }], html: banner("green", ors.t, ors.s) + rb };
      const p = C.parkland({ kg, tbsa: t, hoursSince: h });
      return { bar: [{ label: f[0].name, value: f0(p.total), sub: "mL in 24 h", chips: [{ t: p.late ? `${f1(p.rateNext)} mL/h` : `${f1(p.rateFirst)} mL/h`, level: "amber" }] }],
        html: `<div class="rtab"><div class="lrow"><span>${esc(f[0].name)}: 4 × ${f1(kg)} kg × ${f1(t)}%</span><span class="lv"><b>${f0(p.total)}</b> mL</span></div>`
          + (p.late ? `<div class="lrow"><span>First 8 h has passed (${f1(h)} h since the burn): the remaining half, over the ${f1(24 - h)} h left</span><span class="lv"><b>${f1(p.rateNext)}</b> mL/h</span></div>`
            : `<div class="lrow"><span>${esc(f[1].name)}: ${f0(p.half)} mL over ${f1(p.windowHours)} h${h > 0 ? ` (${f1(h)} h already elapsed)` : ""}</span><span class="lv"><b>${f1(p.rateFirst)}</b> mL/h</span></div>`
            + `<div class="lrow"><span>${esc(f[2].name)}: ${f0(p.half)} mL over 16 h</span><span class="lv"><b>${f1(p.rateNext)}</b> mL/h</span></div>`)
          + `<div class="lrow"><span>${esc(f[3].name)}: 0.5 mL/kg/h</span><span class="lv"><b>${f1(0.5 * kg)}</b> mL/h</span></div></div><p class="hint">${esc(f[3].expr)}${plus(f[3].s)}</p>` + rb }; } };

  const ageRow = (rows, age) => { // "<1", "1–<2", … "≥9" → the printed row (two age/value column pairs per row)
    const flat = []; rows.forEach(r => [0, 3].forEach(o => { const a = r[o]; if (a) flat.push({ a, head: C.toNum(r[o + 1]), leg: C.toNum(r[o + 2]) }); }));
    const hit = flat.find(x => { let m; if ((m = /^<(\d+)$/.exec(x.a))) return age < +m[1]; if ((m = /^≥(\d+)$/.exec(x.a))) return age >= +m[1]; if ((m = /^(\d+)–<(\d+)$/.exec(x.a))) return age >= +m[1] && age < +m[2]; return false; });
    return hit || null; };
  SPEC["burns-paeds"] = { skip: [], only: null,
    ui: () => panel("Child", `<div class="ngrid">${num("kg", "Weight", "kg")}${num("age", "Age", "years (decimals for infants)")}${num("tbsa", "Burn area", "% TBSA")}</div>`),
    calc: d => { const kg = nv("kg"), age = nv("age"), t = nv("tbsa"), f = blk(d, "left.0").items, g = blk(d, "left.1"), row = Number.isFinite(age) ? ageRow(g.rows, age) : null;
      const tb = row ? `<p class="hint">Head + neck <b>${row.head}%</b> · each leg <b>${row.leg}%</b> at this age (${esc(g.title)})${plus(g.s)}</p>` : "";
      if (![kg, age, t].every(Number.isFinite)) return { bar: [{ label: "Resuscitation 24 h", value: "—", sub: "enter weight, age and %TBSA", chips: [] }], html: tb };
      const p = C.paedsBurns({ kg, ageYears: age, tbsa: t });
      const line = (name, val, unit, extra = "") => `<div class="lrow"><span>${esc(name)}${extra}</span><span class="lv"><b>${val}</b> <small>${unit}</small></span></div>`;
      return { bar: [{ label: f[0].name, value: f0(p.resus), sub: "mL in 24 h", chips: [{ t: `+ maintenance ${f0(p.maint)} mL`, level: "amber" }] }],
        html: `${p.capped ? banner("amber", "%TBSA capped at 50 for these formulas") : ""}<div class="rtab">`
          + line(f[0].name, f0(p.resus), "mL", ` (${f1(kg)} kg × ${f1(p.pct)}%) — ${f0(p.first8)} mL in the first 8 h, ${f0(p.next16)} mL over the next 16 h`)
          + line(f[1].name, f0(p.maint), "mL/24 h", age <= 1 ? " (≤1 y: 120 mL/kg)" : " (100 / 50 / 20 mL/kg rule)")
          + line("Resuscitation + maintenance, 24 h", f0(p.resus + p.maint), "mL")
          + line(f[3].name, f0(p.day2), "mL", " (1.5 mL × kg × % + maintenance)")
          + line(f[4].name, f0(p.energyKj), "kJ/day") + line(f[5].name, f0(p.proteinG), "g/day")
          + line(f[2].name, `${f1(kg)}–${f1(2 * kg)}`, "mL/h", " (1–2 mL/kg/h)") + `</div>` + tb }; } };

  // card-specific tab / skip / only resolvers
  const val = (x, tab) => typeof x === "function" ? x(tab) : x;

  /* ---------- page ---------- */
  function check(d, spec) {
    const w = [...srcCheck(d)];
    if (!spec) w.push("no calculator is defined for this card id");
    ["left", "right"].forEach(s => (d[s] || []).forEach((b, i) => { if (!["points", "grid", "bands", "formula", "list", "steps", "stg"].includes(b.type)) w.push(`${s}.${i}: unknown block type ${b.type}`); }));
    const tot = { alvarado: [0, 10], curb65: [0, 5], ipss: [0, 35], phq9: [0, 27], csrs: [-3, 11] }[d.id]; // the range printed on the card
    if (tot) { const b = [...d.left, ...d.right].find(x => x.type === "points"), col = b.cols[0].key; let lo = 0, hi = 0;
      b.rows.forEach(r => { const v = r.pts?.[col]; if (v == null) return; if (typeof v === "string") { const m = /(\d+)\s*[–-]\s*(\d+)/.exec(v); hi += m ? +m[2] : 0; } else if (v > 0) hi += v; else lo += v; });
      if (lo !== tot[0] || hi !== tot[1]) w.push(`points range ${lo}..${hi} does not match the card's ${tot[0]}..${tot[1]}`); }
    if (spec?.check) w.push(...spec.check(d));
    return w;
  }

  async function render(id, e, d) {
    const spec = SPEC[id];
    if (!S.sc || S.sc.id !== id) { S.sc = { id, d, e, v: {}, tab: null, cor: new Set(), kind: "sc22" }; const w = check(d, spec); if (w.length) console.warn(`Score card ${id}:\n - ` + w.join("\n - ")); }
    S.sc.d = d; S.sc.e = e; S.sc.kind = "sc22";
    if (!spec) { app.innerHTML = `<main><p class="hint">No calculator is defined for card ${esc(id)}.</p></main>`; return; }
    const tab = S.sc.tab = S.sc.tab && spec.tabs?.some(t => t[0] === S.sc.tab) ? S.sc.tab : (spec.tabs?.[0]?.[0] || null);
    const skip = val(spec.skip, tab) || [], only = spec.only === undefined ? null : val(spec.only, tab);
    const ids = [...d.left.map((_, i) => "left." + i), ...d.right.map((_, i) => "right." + i)].filter(x => !skip.includes(x) && (only == null || only.includes(x)));
    const tabs = spec.tabs ? `<div class="seg2 s22 wver" role="tablist">${spec.tabs.map(([k, t]) => `<button data-tab22="${k}" aria-pressed="${k === tab}">${esc(t)}</button>`).join("")}</div>` : "";
    const hint = `<p class="hint">${esc(d.setting || "")} · ${esc(d.hospital || "")} · updated ${esc(d.updated || "")}. ${esc(d.dagger_note || "")}</p>`;
    app.innerHTML = cardHeader({ ...d, age_range: d.subtitle }, d.badge || TYPE_LABEL[d.type]).replace("{{extra}}", "") + `<main class="fade scorepage sc22" id="sc22">${hint}${tabs}
      <div id="sc22-in">${spec.ui(d, tab)}</div>
      <div class="wtotal" id="sc22-bar" aria-live="polite"></div><div id="sc22-res"></div>
      <h2 class="glabel">Reference</h2>${ids.map(x => refBlock(blk(d, x))).join("")}
      <p class="hint">${esc(d.card_note || "")}</p>${e?.pdf ? `<div class="toolrow" style="justify-content:flex-start;padding:0 4px"><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">View card</a></div>` : ""}
      ${scSrcList(d)}${await scPdfRows(d)}</main>`;
    update();
  }
  function update() {
    const d = S.sc.d, spec = SPEC[S.sc.id]; if (!spec || !$("#sc22-bar")) return;
    let r; try { r = spec.calc(d, S.sc.tab); } catch (err) { console.warn("calculator error", err); r = { bar: [], html: `<p class="hint">Could not calculate: ${esc(err.message)}</p>` }; }
    $("#sc22-bar").innerHTML = `<div class="wbar">${r.bar.map(b => `<div class="wcol"><div class="wl">${esc(b.label)}</div><div class="wv"><b>${esc(b.value)}</b><span> ${esc(b.sub || "")}</span></div>
      <div class="tsub">${(b.chips || []).map(c => `<span class="sbc l-${LV(c.level)}">${esc(c.t)}</span>`).join("")}</div></div>`).join("")}<button class="clr" data-reset22>Reset</button></div>`;
    $("#sc22-res").innerHTML = r.html || "";
  }

  /* ---------- events (only while a block-schema card is open) ---------- */
  const live = () => S.sc?.kind === "sc22" && $("#sc22");
  const onChange = ev => {
    if (!live()) return; const t = ev.target, k = t.dataset?.k; if (!k) return;
    if (t.type === "checkbox") V()[k] = t.checked; else if (t.type === "radio") { if (!t.checked) return; V()[k] = t.value; } else V()[k] = t.value;
    SPEC[S.sc.id].sync?.(k); update();
  };
  document.addEventListener("input", ev => { if (live() && ev.target.type !== "radio" && ev.target.type !== "checkbox" && ev.target.tagName !== "SELECT") onChange(ev); });
  document.addEventListener("change", ev => { if (live() && (ev.target.type === "radio" || ev.target.type === "checkbox" || ev.target.tagName === "SELECT")) onChange(ev); });
  document.addEventListener("click", ev => {
    if (!live()) return; const t = ev.target.closest?.("button"); if (!t) return;
    if (t.dataset.c22 !== undefined) { const n = t.closest(".body")?.querySelector(".cnote") || t.parentElement.querySelector(".cnote") || t.nextElementSibling; if (n) n.hidden = !n.hidden; return; }
    if (t.dataset.reset22 !== undefined) { S.sc.v = {}; render(S.sc.id, S.sc.e, S.sc.d); return; }
    if (t.dataset.tab22) { S.sc.tab = t.dataset.tab22; render(S.sc.id, S.sc.e, S.sc.d); return; }
    if (t.dataset.set22) { const [k, v] = t.dataset.set22.split(":"); V()[k] = v; render(S.sc.id, S.sc.e, S.sc.d); }
  });

  return { render, SPEC, check };
}
