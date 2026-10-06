// Pure calculation registry for Scales and Calculations. No DOM and no eval: every calculation is a named function
// keyed by formula id, taking one object of numbers. Imported by app.js.
// To add a calculator, add a function here and (for the app) an entry in CALCS / the card's formulas[].
export const KPA_TO_MMHG = 7.5;
const around = (x, w) => ({ exp: x, lo: x - w, hi: x + w });

export const REG = {
  // GCS paediatric TBI card
  target_map_paeds_tbi: v => 65 + 1.5 * v.age,
  cpp: v => v.map - v.icp,
  min_sbp_child: v => 70 + 2 * v.age,
  // blood gas (all pCO2 values in mmHg)
  anion_gap: v => v.na - (v.cl + v.hco3),
  ag_albumin_corrected: v => v.ag + 0.25 * (40 - v.albumin),
  delta_ratio: v => (v.ag - 12) / (24 - v.hco3),
  winters: v => around(1.5 * v.hco3 + 8, 2),
  met_alk_pco2: v => around(0.7 * v.hco3 + 20, 5),
  resp_acidosis_hco3: v => ({ acute: 24 + 1 * (v.pco2 - 40) / 10, chronic: 24 + 4 * (v.pco2 - 40) / 10 }),
  resp_alkalosis_hco3: v => ({ acute: 24 - 2 * (40 - v.pco2) / 10, chronic: 24 - 5 * (40 - v.pco2) / 10 }),
  k_corrected_ph: v => v.k - 0.6 * (7.4 - v.ph) / 0.1,
  na_corrected_glucose: v => v.na + 0.3 * (v.glucose - 5.6),
  na_corrected_glucose_litfl: v => v.na + 1.6 * (v.glucose - 5.6) / 5.6, // LITFL's alternative, shown as a secondary value
  osmolarity_calc: v => 2 * (v.na + v.k) + v.glucose + v.urea,
  osmolar_gap: v => v.measured - v.calculated,
  mmhg_kpa: v => v.mmhg * 0.133,
  kpa_mmhg: v => v.kpa * KPA_TO_MMHG,
};

// delta_bands: min inclusive, max exclusive, null = open-ended
export const deltaBand = (v, bands = []) => bands.findIndex(b => (b.min == null || v >= b.min) && (b.max == null || v < b.max));

const TOL = 2; // mmol/L either side of the expected HCO3 for respiratory disorders
// Respiratory acidosis / alkalosis: compare HCO3 with the acute and chronic expectations (or the chosen one +/- TOL).
function respComp(kind, i) {
  const e = (kind === "RAc" ? REG.resp_acidosis_hco3 : REG.resp_alkalosis_hco3)(i), h = i.hco3, flags = [];
  const low = "+ metabolic acidosis", high = "+ metabolic alkalosis";
  let text;
  if (i.chron === "acute" || i.chron === "chronic") {
    const x = e[i.chron];
    if (h > x + TOL) { text = high; flags.push("MAl"); } else if (h < x - TOL) { text = low; flags.push("MAc"); } else text = `appropriate for ${i.chron}`;
  } else {
    const nearA = Math.abs(h - e.acute) <= TOL, nearC = Math.abs(h - e.chronic) <= TOL, lo = Math.min(e.acute, e.chronic), hi = Math.max(e.acute, e.chronic);
    if (nearA && nearC) text = "consistent with acute or chronic (pCO₂ only mildly abnormal)";
    else if (nearA) text = "consistent with acute";
    else if (nearC) text = "consistent with chronic";
    else if (h < lo - TOL) { text = low; flags.push("MAc"); } else if (h > hi + TOL) { text = high; flags.push("MAl"); }
    else text = "between acute and chronic: acute-on-chronic / partially compensated";
  }
  return { for: kind, ...e, text, flags };
}
// metabolic disorders: measured pCO2 against the expected range
function metComp(kind, i) {
  const e = (kind === "MAc" ? REG.winters : REG.met_alk_pco2)(i);
  const text = i.pco2 > e.hi ? "+ concurrent respiratory acidosis" : i.pco2 < e.lo ? "+ concurrent respiratory alkalosis" : "appropriate";
  return { for: kind, ...e, text, flags: text.includes("acidosis") ? ["RAc"] : text.includes("alkalosis") ? ["RAl"] : [] };
}

// Which interpretation_stg lines are triggered by the numbers. Lines with no rule are just listed.
export const STG_RULES = [
  { re: /^DKA: AG >20/, test: r => r.agUsed > 20 || r.osmUsed > 320 },
  { re: /^DKA child: pH <7\.3/, test: (r, i) => i.ph < 7.3 && i.hco3 < 15 },
  { re: /^DKA child: pCO₂ <20/, test: (r, i) => i.pco2 < 20 },
  { re: /^Toxic alcohol Rx/, test: (r, i) => i.hco3 < 20 || i.ph < 7.3 },
  { re: /^Dialysis/, test: (r, i) => i.ph < 7.15 },
];

/* i: numbers (NaN or undefined = not entered); pco2 in mmHg; chron "acute" | "chronic" | "unknown".
   data: the card JSON (uses delta_bands and interpretation_stg). Returns everything the Analyse tab shows. */
export function analyse(i, data = {}) {
  const has = k => Number.isFinite(i[k]);
  const r = { phState: null, primaries: [], mixed: false, compensatedOrMixed: false, comp: [], causes: [], stg: [] };
  const core = has("ph") && has("pco2") && has("hco3");
  r.core = core;
  if (has("ph")) r.phState = i.ph < 7.35 ? "acidaemia" : i.ph > 7.45 ? "alkalaemia" : "normal";
  if (core) {
    if (r.phState === "acidaemia") { if (i.pco2 > 45) r.primaries.push("RAc"); if (i.hco3 < 22) r.primaries.push("MAc"); }
    else if (r.phState === "alkalaemia") { if (i.pco2 < 35) r.primaries.push("RAl"); if (i.hco3 > 26) r.primaries.push("MAl"); }
    else r.compensatedOrMixed = i.pco2 > 45 || i.pco2 < 35 || i.hco3 < 22 || i.hco3 > 26;
    r.mixed = r.primaries.length > 1;
    if (r.primaries.length === 1) { const p = r.primaries[0]; r.comp.push(p === "MAc" || p === "MAl" ? metComp(p, i) : respComp(p, i)); }
  }
  if (has("na") && has("cl") && has("hco3")) {
    r.ag = REG.anion_gap(i); r.agHigh = r.ag > 16;
    if (has("albumin")) { r.agCorr = REG.ag_albumin_corrected({ ag: r.ag, albumin: i.albumin }); r.agCorrHigh = r.agCorr > 16; }
    r.agUsed = r.agCorr ?? r.ag;
    if (i.hco3 < 24) { r.delta = REG.delta_ratio({ ag: r.agUsed, hco3: i.hco3 }); r.deltaIdx = deltaBand(r.delta, data.delta_bands); }
  }
  if (has("k") && has("ph")) r.kCorr = REG.k_corrected_ph(i);
  if (has("na") && has("glucose")) { r.naCorr = REG.na_corrected_glucose(i); r.naCorrLitfl = REG.na_corrected_glucose_litfl(i); }
  if (has("na") && has("k") && has("glucose") && has("urea")) {
    r.osmCalc = REG.osmolarity_calc(i);
    if (has("osm")) { r.og = REG.osmolar_gap({ measured: i.osm, calculated: r.osmCalc }); r.ogHigh = r.og > 10; }
  }
  r.osmUsed = has("osm") ? i.osm : r.osmCalc;
  // "See causes" targets
  if (r.primaries.includes("MAc") && r.agUsed !== undefined) r.causes.push(r.agUsed > 16 ? "HAGMA" : "NAGMA");
  for (const p of r.primaries) if (p !== "MAc") r.causes.push(p);
  if (r.ogHigh) r.causes.push("OG");
  (data.interpretation_stg || []).forEach((b, k) => { const rule = STG_RULES.find(x => x.re.test(b.t));
    if (rule && rule.test(r, i)) r.stg.push(k); });
  return r;
}

/* ---------- checklist score cards (Wells PE, Wells DVT; any card with versions[] + components[].points) ---------- */
REG.ddimer_age_adjusted = v => (v.age > 50 ? v.age * 10 : null); // µg/L FEU; null = use the standard cut-off (500)
const SCALE = 1000; // add as integers so 1.5 + 1 + ... can never drift
// points[version] null/undefined = the item is not part of that version and is ignored
export function scoreCard(card, version, ticked) {
  const on = new Set(ticked); let total = 0, lo = 0, hi = 0;
  for (const c of card.components) { const p = c.points?.[version]; if (p == null) continue;
    const n = Math.round(p * SCALE); if (n < 0) lo += n; else hi += n; if (on.has(c.key)) total += n; }
  return { total: total / SCALE, min: lo / SCALE, max: hi / SCALE };
}
export const wells_pe = (card, ticked, version) => scoreCard(card, version, ticked).total;
export const wells_dvt = (card, ticked, version) => scoreCard(card, version, ticked).total;
export const bandFor = (bands, total) => bands.find(b => b.min <= total && total <= b.max); // inclusive; the gaps between bands are intentional
// every scheme for the version with its matching band, plus the likely/unlikely call that picks the next steps
export function interpretCard(card, version, total) {
  const schemes = card.interpretation.filter(x => x.version === version).map(x => ({ ...x, band: bandFor(x.bands, total) }));
  const two = schemes.find(x => /two-level/i.test(x.scheme)), three = schemes.find(x => /three-tier/i.test(x.scheme)), use = two || three;
  const lvl = use?.band?.level;
  return { schemes, likely: lvl === undefined ? null : lvl === "red", mapped: !two && !!three, basis: use?.scheme };
}
export function validateScoreCard(card) { // returns warnings (empty = fine)
  const bad = [];
  card.versions.forEach((v, i) => { const r = card.formulas[i]?.range, t = scoreCard(card, v.key, []);
    if (!r) { bad.push(`formulas[${i}] has no range for version ${v.key}`); return; }
    if (t.min !== r[0]) bad.push(`${v.key}: negative points sum to ${t.min}, formulas[${i}].range[0] is ${r[0]}`);
    if (t.max !== r[1]) bad.push(`${v.key}: positive points sum to ${t.max}, formulas[${i}].range[1] is ${r[1]}`); });
  card.interpretation.forEach(x => { const i = card.versions.findIndex(v => v.key === x.version), r = card.formulas[i]?.range;
    if (!r) { bad.push(`interpretation for unknown version ${x.version}`); return; }
    if (x.bands[0].min !== r[0]) bad.push(`${x.version}/${x.scheme}: first band starts at ${x.bands[0].min}, range starts at ${r[0]}`);
    if (x.bands[x.bands.length - 1].max !== r[1]) bad.push(`${x.version}/${x.scheme}: last band ends at ${x.bands[x.bands.length - 1].max}, range ends at ${r[1]}`); });
  return bad;
}
