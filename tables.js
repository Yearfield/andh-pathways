// tables.js — table + formula cards (infusion calculator, adrenaline infusions, phenytoin loading, anaemia & iron, Hunter criteria, toxidromes).
// A card has inputs[], tables[] { title, head[], rows[][], s, d, note }, formulas[] { id, name, expr, vars, units }, optional components[] (read-only bands).
// Loaded by app.js, which passes its helpers in. The pure functions (planFormulas, solve, fmt) are exported for tests/tables.test.mjs.
// A formula is calculated only when its right-hand side is plain arithmetic over its own declared vars; anything else is shown as text.
import { evalExpr } from "./anthro.js";

/* ===================================== pure helpers ===================================== */
const norm = s => String(s).replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/");
// left side "mL/h", "conc (mcg/mL)", "mg" -> the variable name another formula would use for it ("mlh", "conc", "mg")
export const lhsKey = lhs => { const t = String(lhs).replace(/\(.*?\)/g, "").trim(); return /^mL\s*\/\s*h$/i.test(t) ? "mlh" : /^[A-Za-z_]\w*$/.test(t) ? t : null; };
// Split "lhs = rhs" and decide whether the rhs can be evaluated: every identifier must be one of f.vars (matched without case).
export function planFormula(f) {
  const expr = String(f.expr || ""), eq = expr.indexOf("="); // no "=" (e.g. Mentzer "MCV ÷ RBC"): the whole text is the right side
  const lhs = eq < 0 ? "" : expr.slice(0, eq).trim(); let rhs = (eq < 0 ? expr : expr.slice(eq + 1)).trim();
  if (/[<>≤≥=↑↓]/.test(rhs) || /\b(AND|OR)\b/.test(rhs)) return { id: f.id, calc: false };
  const keys = Object.keys(f.vars || {}), byLower = Object.fromEntries(keys.map(k => [k.toLowerCase(), k]));
  if ("mlh" in byLower) rhs = rhs.replace(/\bmL\s*\/\s*h\b/g, "mlh"); // "mL/h × conc" when the declared var is mlh
  const ids = norm(rhs).match(/[A-Za-z_][A-Za-z_0-9]*/g) || [];
  if (!ids.length || ids.some(i => !(i.toLowerCase() in byLower))) return { id: f.id, calc: false };
  rhs = norm(rhs).replace(/[A-Za-z_][A-Za-z_0-9]*/g, i => byLower[i.toLowerCase()]);
  const vars = [...new Set(ids.map(i => byLower[i.toLowerCase()]))];
  try { evalExpr(rhs, Object.fromEntries(vars.map(v => [v, 1]))); } catch { return { id: f.id, calc: false }; }
  return { id: f.id, calc: true, lhs, out: lhsKey(lhs), rhs, vars };
}
// All formulas of a card. A value feeds other formulas only when exactly one formula produces that name (four "mL/h" formulas feed nothing).
export function planFormulas(formulas = []) {
  const plans = formulas.map(planFormula), count = {};
  plans.forEach(p => { if (p.calc && p.out) count[p.out] = (count[p.out] || 0) + 1; });
  plans.forEach(p => { p.feeds = !!(p.calc && p.out && count[p.out] === 1); });
  return plans;
}
const pos = v => { if (v === "" || v == null) return NaN; const n = +v; return Number.isFinite(n) && n >= 0 ? n : NaN; }; // 0 is allowed (0 mL syrup); a division by 0 gives no result
// Values typed by the user win; a blank var takes the value of the single formula that produces it. Returns { values, derived, results }.
export function solve(plans, typed = {}) {
  const values = {}, derived = {}, results = {};
  Object.entries(typed).forEach(([k, v]) => { const n = pos(v); if (Number.isFinite(n)) values[k] = n; });
  for (let pass = 0; pass < plans.length + 1; pass++) {
    let changed = false;
    plans.forEach(p => {
      if (!p.calc) return;
      const ready = p.vars.every(v => Number.isFinite(values[v]));
      const r = ready ? evalExpr(p.rhs, values) : NaN;
      results[p.id] = Number.isFinite(r) && r >= 0 ? r : NaN;
      if (p.feeds && Number.isFinite(results[p.id]) && !Number.isFinite(pos(typed[p.out])) && values[p.out] !== results[p.id]) { values[p.out] = results[p.id]; derived[p.out] = p.id; changed = true; }
    });
    if (!changed) break;
  }
  return { values, derived, results };
}
// 3 significant figures, never fewer than the whole number: 0.18 · 2.5 · 41.7 · 1400
export const fmt = x => !Number.isFinite(x) ? "—" : Math.abs(x) >= 100 ? String(Math.round(x)) : String(+x.toPrecision(3));

/* ===================================== card module ===================================== */
export function createTableCards(H) {
  const { S, esc, $, $$, cardHeader, scPdfRows, srcCheck, scRef, scDag, TYPE_LABEL, app } = H;
  const V = () => S.sc.v;
  const mark = it => `${scDag(it?.d)}${it?.s ? scRef(it.s) : ""}`;
  const lvl = l => ({ blue: "grey", grey: "grey", green: "green", amber: "amber", orange: "orange", red: "red", purple: "purple" }[l] || "grey");
  const card = (title, inner, extra = "") => `<section class="card"><h2 class="ctitle">${esc(title)}${extra}</h2>${inner}</section>`;

  function inputsHtml(d, plans) {
    const need = [...new Set(plans.filter(p => p.calc).flatMap(p => p.vars))];
    if (!need.length) return "";
    const info = {}; (d.inputs || []).forEach(i => { info[i.id] = { label: i.label, unit: i.unit }; });
    d.formulas.forEach(f => Object.entries(f.vars || {}).forEach(([k, u]) => { info[k] ||= { label: k, unit: u }; }));
    const order = [...(d.inputs || []).map(i => i.id).filter(k => need.includes(k)), ...need.filter(k => !(d.inputs || []).some(i => i.id === k))];
    return card("Calculate", `<div class="pin"><div class="ngrid">${order.map(k => `<label class="ni"><span class="nl">${esc(info[k].label)}</span><span class="inp"><input type="number" inputmode="decimal" step="any" min="0" data-tv="${esc(k)}" value="${esc(V()[k] ?? "")}" autocomplete="off"><em>${esc(info[k].unit || "")}</em></span><span class="sub2" data-tauto="${esc(k)}"></span></label>`).join("")}</div>
      <div id="tc-out" aria-live="polite"></div><div class="toolrow" style="justify-content:flex-start"><button class="clr" data-treset>Clear</button></div></div>`);
  }
  function outHtml(d, plans) {
    const { results, values } = solve(plans, V());
    return plans.filter(p => p.calc).map(p => { const f = d.formulas.find(x => x.id === p.id), r = results[p.id], miss = p.vars.filter(v => !Number.isFinite(values[v]));
      return `<div class="sbn l-grey"><b>${esc(f.name)}</b> <span class="zv">${Number.isFinite(r) ? `<b>${esc(fmt(r))}</b> ${esc(f.units || p.lhs)}` : "—"}</span>${mark(f)}
        <div class="sub2"><code>${esc(f.expr)}</code>${Number.isFinite(r) ? "" : ` · enter ${miss.map(esc).join(", ")}`}</div></div>`; }).join("");
  }
  const tableHtml = t => card(t.title, `<div class="tscroll"><table class="dtab"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r =>
    `<tr>${r.map((c, k) => k ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join("")}</tr>`).join("")}</tbody></table></div>${t.note ? `<p class="hint" style="padding:6px 14px 12px">${esc(t.note)}</p>` : ""}`, mark(t));
  const compHtml = c => card(c.name, `<ul class="items bands">${c.items.map(it => `<li class="band lvl-${esc(it.level || "green")} on"><span class="rng">${esc(it.band ?? it.score ?? "")}</span><div class="body"><span class="txt">${esc(it.label || it.t)}${mark(it)}</span></div></li>`).join("")}</ul>`,
    `${c.range ? ` <span class="cs2">${esc(c.range)}</span>` : ""}${mark(c)}`);

  async function render(id, e, d) {
    if (!S.sc || S.sc.id !== id) { S.sc = { id, d, e, v: {}, kind: "tables", cor: new Set() }; const w = srcCheck(d); if (w.length) console.warn(`Card ${id}:\n - ` + w.join("\n - ")); }
    S.sc.d = d; S.sc.e = e; S.sc.kind = "tables";
    const plans = S.sc.plans = planFormulas(d.formulas);
    const textOnly = d.formulas.filter((f, i) => !plans[i].calc);
    app.innerHTML = cardHeader(d, TYPE_LABEL[d.type] || "Card").replace("{{extra}}", "") + `<main class="fade scorepage sc22 vit" id="tables22"><p class="hint">${esc(d.setting)} · ${esc(d.hospital)} · updated ${esc(d.updated)}. ${esc(d.dagger_note || "")}</p>
      ${d.top_question ? `<div class="sbn l-amber"><b>${esc(d.top_question.t)}</b>${mark(d.top_question)}</div>` : ""}
      ${inputsHtml(d, plans)}
      ${(d.components || []).map(compHtml).join("")}
      ${(d.tables || []).map(tableHtml).join("")}
      ${textOnly.length ? card("Doses and rules", `<ul class="items">${textOnly.map(f => `<li><div class="body"><span class="txt"><b>${esc(f.name)}</b> — ${esc(f.expr)}${f.range ? ` · ${esc(f.range)}` : ""}${mark(f)}</span></div></li>`).join("")}</ul>`) : ""}
      ${(d.interpretation_stg || []).length ? card("Interpretation", `<ul class="items bands">${d.interpretation_stg.map(b => `<li class="band lvl-${esc(lvl(b.level))} on"><div class="body"><span class="txt">${esc(b.t)}${mark(b)}</span></div></li>`).join("")}</ul>`) : ""}
      ${(d.notes || []).length ? `<details class="vfoot"><summary>Notes (${d.notes.length})</summary><ul class="items">${d.notes.map(n => `<li><div class="body"><span class="txt">${esc(n.t)}${mark(n)}</span></div></li>`).join("")}</ul></details>` : ""}
      <details class="vfoot"><summary>Formulas (${d.formulas.length})</summary><ul class="items">${d.formulas.map(f => `<li><div class="body"><span class="txt"><b>${esc(f.name)}</b> — <code>${esc(f.expr)}</code>${f.units ? ` (${esc(f.units)})` : ""}${mark(f)}</span></div></li>`).join("")}</ul></details>
      <details class="vfoot"><summary>Sources</summary><ul class="items">${(d.sources || []).map(s => `<li><div class="body"><span class="txt"><b>${esc(s.id)}</b> — ${esc(s.title)}${s.url ? ` · <a class="ref" href="${esc(s.url)}" target="_blank" rel="noopener">open online</a>` : ""}</span></div></li>`).join("")}</ul>${await scPdfRows(d)}</details>
      ${e?.pdf ? `<div class="toolrow" style="justify-content:flex-start;padding:0 4px"><a class="btn" href="${esc(e.pdf)}" target="_blank" rel="noopener">View card (PDF)</a></div>` : ""}</main>`;
    update();
  }
  function update() {
    const d = S.sc?.d; if (!d || !$("#tc-out")) return;
    const { derived, values } = solve(S.sc.plans, V());
    $("#tc-out").innerHTML = outHtml(d, S.sc.plans);
    $$("[data-tauto]").forEach(el => { const k = el.dataset.tauto, from = derived[k]; el.textContent = from ? `= ${fmt(values[k])} from ${d.formulas.find(f => f.id === from).name}` : ""; });
  }
  const live = () => S.sc?.kind === "tables" && $("#tables22");
  document.addEventListener("input", ev => { const t = ev.target; if (!live() || !t.dataset?.tv) return; V()[t.dataset.tv] = t.value; update(); });
  document.addEventListener("click", ev => { if (!live() || !ev.target.closest?.("[data-treset]")) return; S.sc.v = {}; $$("[data-tv]").forEach(i => { i.value = ""; }); update(); });
  return { render };
}
