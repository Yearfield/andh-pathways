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

/* =====================================================================================================
   Block-schema score cards (Alvarado, APGAR, IPSS, CURB-65, Duke, Ottawa, PECARN, UGIB, chest pain, GRACE,
   CSRS, Caprini, Framingham, renal, liver, Light's, Ganzoni, burns, PHQ-9, SOFA, COPD-GOLD).
   Pure parsing helpers and calculators only. Nothing here evaluates the human-readable formulas[].expr text:
   every calculation is an explicit function. The interface lives in scores.js; labels / points / bands come from the JSON.
   ===================================================================================================== */
export const toNum = s => { if (typeof s === "number") return s; const t = String(s ?? "").replace(/[−–]/g, "-").replace(/^\+/, "").trim(); return t === "" ? NaN : Number(t); };

// "≤−2" "<4.1" "≥90" ">1.5" "50–69" "−1 to 0" "0" (a trailing "(…)" or % is ignored) -> {lo, hi, loInc, hiInc}
export function parseRange(label) {
  const t = String(label ?? "").replace(/[‡*†]/g, "").replace(/\s+/g, " ").trim().replace(/−/g, "-");
  const N = "(-?\\d+(?:\\.\\d+)?)"; let m;
  if ((m = new RegExp("^(?:≤|<=)\\s*" + N).exec(t))) return { lo: -Infinity, hi: +m[1], loInc: true, hiInc: true };
  if ((m = new RegExp("^<\\s*" + N).exec(t))) return { lo: -Infinity, hi: +m[1], loInc: true, hiInc: false };
  if ((m = new RegExp("^(?:≥|>=)\\s*" + N).exec(t))) return { lo: +m[1], hi: Infinity, loInc: true, hiInc: true };
  if ((m = new RegExp("^>\\s*" + N).exec(t))) return { lo: +m[1], hi: Infinity, loInc: false, hiInc: true };
  if ((m = new RegExp("^" + N + "\\s*(?:–|—|to|-)\\s*" + N).exec(t))) return { lo: +m[1], hi: +m[2], loInc: true, hiInc: true };
  if ((m = new RegExp("^" + N + "$").exec(t))) return { lo: +m[1], hi: +m[1], loInc: true, hiInc: true };
  return null;
}
export const inRange = (r, v) => !!r && Number.isFinite(v) && (r.loInc === false ? v > r.lo : v >= r.lo) && (r.hiInc === false ? v < r.hi : v <= r.hi);
// index of the label whose range starts at or below v (the last such): tolerant of the small gaps between printed bands (35–70, 71–105)
export function pickRange(labels, v) {
  if (!Number.isFinite(v)) return -1;
  let best = -1, bestLo = -Infinity;
  labels.forEach((l, i) => { const r = parseRange(l); if (!r) return;
    if (!(r.loInc === false ? v > r.lo : v >= r.lo)) return;
    if (best < 0 || r.lo > bestLo) { best = i; bestLo = r.lo; } });
  return best;
}
// band index from interpretation items: min/max when given, otherwise the printed label ("≤−2", "−1 to 0", "≥6")
export function bandIdx(items, v) {
  if (!Number.isFinite(v)) return -1;
  return items.findIndex(b => (b.min != null || b.max != null) ? ((b.min == null || v >= b.min) && (b.max == null || v <= b.max)) : inRange(parseRange(b.label), v));
}
export const sum = a => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);

/* --- renal --- */
export const ckdEpi2021 = ({ scrUmol, age, female }) => { const scr = scrUmol / 88.4, k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302;
  return 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age) * (female ? 1.012 : 1); };
export const mdrd = ({ scrUmol, age, female }) => 175 * Math.pow(scrUmol / 88.4, -1.154) * Math.pow(age, -0.203) * (female ? 0.742 : 1);
export const cockcroftGault = ({ age, kg, scrUmol, female }) => (140 - age) * kg * (female ? 1.04 : 1.23) / scrUmol;
// Schwartz K (SA paediatric STG): LBW <2.5 kg 30 · 0–8 months 40 · girls 2–16 y 49 · boys 2–12 y 49 · boys 13–16 y 60; none for 8 months–2 years
export function schwartzK({ ageYears, female, lbw }) {
  if (lbw) return { k: 30, label: "low birth weight <2.5 kg" };
  const mo = ageYears * 12;
  if (mo <= 8) return { k: 40, label: "infant 0–8 months" };
  if (mo < 24) return { k: null, label: "8 months to 2 years: no STG K value" };
  if (ageYears > 16) return { k: null, label: "over 16 years: use CKD-EPI" };
  if (female) return { k: 49, label: "girl 2–16 years" };
  return ageYears < 13 ? { k: 49, label: "boy 2–12 years" } : { k: 60, label: "boy 13–16 years" };
}
export const schwartz = ({ k, heightCm, scrUmol }) => k * heightCm / scrUmol;
export const ureaCreat = ({ urea, scrUmol }) => urea / scrUmol * 1000;       // SI ratio
export const bunCr = ratioSI => ratioSI * 0.2475;                              // US BUN:Cr (BUN mg/dL = urea mmol/L × 2.8)
export const gStage = e => e >= 90 ? "G1" : e >= 60 ? "G2" : e >= 45 ? "G3a" : e >= 30 ? "G3b" : e >= 15 ? "G4" : "G5";
export const G_STAGES = ["G1", "G2", "G3a", "G3b", "G4", "G5"];
export const aStage = u => u < 3 ? "A1" : u <= 30 ? "A2" : "A3";              // UACR mg/mmol: A1 <3, A2 3–30, A3 >30

/* --- iron and burns --- */
export const ganzoni = ({ kg, hbActual, hbTarget = 15, stores = 500 }) => kg * (hbTarget - hbActual) * 2.4 + stores;
export const ironSucroseDoses = deficitMg => Math.ceil(deficitMg / 200);
export function parkland({ kg, tbsa, hoursSince = 0 }) {
  const total = 4 * kg * tbsa, half = total / 2, h = Math.max(0, hoursSince || 0);
  // the first half is given over the first 8 h FROM THE BURN: if h hours have passed it is given over the 8 − h that remain
  if (h < 8) return { total, half, rateFirst: half / (8 - h), rateNext: half / 16, windowHours: 8 - h, late: false };
  return { total, half, rateFirst: null, rateNext: half / Math.max(24 - h, 1), windowHours: 0, late: true };
}
export const paedsMaintenance = ({ kg, ageYears }) => ageYears <= 1 ? 120 * kg : 100 * Math.min(kg, 10) + 50 * Math.min(Math.max(kg - 10, 0), 10) + 20 * Math.max(kg - 20, 0);
export function paedsBurns({ kg, ageYears, tbsa }) {
  const pct = Math.min(tbsa, 50), maint = paedsMaintenance({ kg, ageYears }), resus = 4 * kg * pct;
  return { pct, capped: tbsa > 50, resus, maint, first8: resus / 2, next16: resus / 2, day2: 1.5 * kg * pct + maint, energyKj: 250 * kg + 150 * pct, proteinG: 3 * kg + pct };
}

/* --- liver --- */
export const rFactor = ({ alt, altUln, alp, alpUln }) => (alt / altUln) / (alp / alpUln);
export function liverPattern({ alt, altUln, alp, alpUln }) {
  const r = rFactor({ alt, altUln, alp, alpUln }), altX = alt / altUln, alpX = alp / alpUln;
  if (!Number.isFinite(r)) return { r, altX, alpX, pattern: null };
  const pattern = altX >= 3 && r >= 5 ? "hepatocellular" : r > 2 && r < 5 ? "mixed" : alpX >= 2 && r <= 2 ? "cholestatic" : "below";
  return { r, altX, alpX, pattern };
}
export const altAdvice = altX => altX < 2.5 ? 0 : altX <= 5 ? 1 : 2; // index into the HOSP 10.16 ART-ALT lines
export function kingsParacetamol({ ph, inr, creat, grade34, lactate4h, lactateFluids }) {
  const a = ph < 7.30, b = inr > 6.5 && creat > 300 && !!grade34, mod = lactate4h > 3.5 || lactateFluids > 3.0;
  return { a, b, mod, meets: a || b || mod };
}
export function kingsNonParacetamol({ age, inr, bili, aetiology, jaundiceEnceph7 }) {
  const items = [age < 10 || age > 40, !!aetiology, !!jaundiceEnceph7, inr > 3.5, bili > 300], count = items.filter(Boolean).length, inrHigh = inr > 6.5;
  return { inrHigh, items, count, meets: inrHigh || count >= 3 };
}

/* --- bedside rules --- */
export function lights({ pProt, sProt, pLdh, sLdh, ldhUln }) {
  const proteinRatio = pProt / sProt, ldhRatio = pLdh / sLdh, c1 = proteinRatio > 0.5, c2 = ldhRatio > 0.6, c3 = pLdh > (2 / 3) * ldhUln;
  return { proteinRatio, ldhRatio, c1, c2, c3, exudate: c1 || c2 || c3 };
}
export const goldGrade = p => p >= 80 ? 1 : p >= 50 ? 2 : p >= 30 ? 3 : p < 30 ? 4 : null;
export const goldGroup = ({ mmrc, exacerbations, hospitalised }) => (exacerbations >= 2 || hospitalised) ? "E" : mmrc >= 2 ? "B" : "A";
export const curbFlags = ({ urea, rr, sbp, dbp, age }) => ({ urea: urea > 7, rr: rr >= 30, bp: sbp < 90 || dbp <= 60, age: age >= 65 });
export const dukeClass = ({ major, minor, path }) => (path || major >= 2 || (major >= 1 && minor >= 3) || minor >= 5) ? "definite" : ((major >= 1 && minor >= 1) || minor >= 3) ? "possible" : "rejected";
export const pecarnClass = ({ high, inter }) => high > 0 ? "high" : inter > 0 ? "intermediate" : "low";
export const mapOf = (sbp, dbp) => (sbp + 2 * dbp) / 3;
export const qsofa = ({ rr, mentation, sbp }) => (rr >= 22 ? 1 : 0) + (mentation ? 1 : 0) + (sbp <= 100 ? 1 : 0);
// Glasgow-Blatchford: which printed row each number falls on (index inside its section; -1 = no row = 0 points)
export function gbsAuto({ urea, hb, male, sbp }) {
  const U = urea >= 25 ? 3 : urea >= 10 ? 2 : urea >= 8 ? 1 : urea >= 6.5 ? 0 : -1;
  const H = hb < 10 ? 2 : male ? (hb < 12 ? 1 : hb < 13 ? 0 : -1) : (hb < 12 ? 0 : -1);
  const S = sbp < 90 ? 2 : sbp < 100 ? 1 : sbp < 110 ? 0 : -1;
  return { U, H, S };
}

/* --- GRACE: tables parsed from the card's grids --- */
export function buildGrace(d) {
  const g = d.left.find(b => b.type === "grid"), pts = d.left.find(b => b.type === "points"), risk = d.right.find(b => b.type === "grid" && b.head.includes("Low"));
  const cols = []; for (let i = 0; i < g.head.length; i += 2) cols.push({ name: g.head[i], labels: [], pts: [] });
  g.rows.forEach(r => cols.forEach((c, j) => { const lab = r[2 * j]; if (lab) { c.labels.push(lab); c.pts.push(toNum(r[2 * j + 1])); } }));
  const killip = pts.rows.filter(r => /^Killip/i.test(r.t)), flags = pts.rows.filter(r => !/^Killip/i.test(r.t) && r.t);
  const sections = []; let cur = null;
  risk.rows.forEach(r => { if (r.section) { cur = { name: r.section, rows: [] }; sections.push(cur); } else if (cur) cur.rows.push(Array.isArray(r) ? r : r.cells); });
  return { cols, killip, flags, risk: sections, riskHead: risk.head };
}
export function graceCalc(t, { age, hr, sbp, creat, killip, flags }) {
  const v = [age, hr, sbp, creat], parts = t.cols.map((c, i) => { const j = pickRange(c.labels, v[i]); return j < 0 ? null : c.pts[j]; });
  const k = t.killip[killip]?.pts?.p ?? 0, f = (t.flags || []).reduce((a, r, i) => a + (flags?.[i] ? r.pts.p : 0), 0);
  return { parts, killip: k, flags: f, total: sum(parts) + k + f, complete: parts.every(p => p != null) };
}
// category 0 low / 1 intermediate / 2 high for each risk row of the chosen ACS type
export function graceRisk(t, typeName, total) {
  const s = t.risk.find(x => x.name === typeName); if (!s) return [];
  return s.rows.map(r => ({ label: r[0], cells: r.slice(1), idx: [1, 2, 3].map(i => r[i]).findIndex(c => inRange(parseRange(c), total)) }));
}

/* --- Framingham: points tables parsed from the card's grids --- */
export function buildFramingham(d) {
  const g1 = d.left.find(b => b.type === "grid" && b.head[0] === "Age"), g2 = d.left.find(b => b.type === "grid" && /^SBP/.test(b.head[0])), rk = d.right.find(b => b.type === "grid" && b.head[0] === "Pts");
  const rows = g1.rows.map(r => r.cells || r), pair = x => { const [a, b] = String(x).split("|").map(s => toNum(s)); return [a, b]; };
  const age = rows.filter(r => r[0]).map(r => ({ label: r[0], M: toNum(r[1]), W: toNum(r[2]) }));
  const tc = rows.filter(r => r[3] && !/^(Smoker|Diabetic)$/i.test(r[3])).map(r => ({ label: r[3], M: toNum(r[4]), W: toNum(r[5]) }));
  const hdl = rows.filter(r => r[6]).map(r => ({ label: String(r[6]).replace(/\s*‡/g, ""), flag: /‡/.test(r[6]), pts: toNum(r[7]) }));
  const sm = rows.find(r => /^Smoker$/i.test(r[3])), di = rows.find(r => /^Diabetic$/i.test(r[3]));
  const sbpRows = Object.fromEntries(g2.rows.map(r => [r[0] === "Men" ? "M" : "W", r.slice(1).map(pair)]));
  const table = new Map(), cell = c => (c && typeof c === "object") ? { v: String(c.v), level: c.level } : { v: String(c), level: null };
  rk.rows.forEach(r => { for (const o of [0, 3]) if (r[o] !== "" && r[o] != null) { const n = toNum(r[o]); table.set(Number.isFinite(n) ? String(n) : String(r[o]), { M: cell(r[o + 1]), W: cell(r[o + 2]) }); } });
  return { age, tc, hdl, smoker: { M: toNum(sm[4]), W: toNum(sm[5]) }, diabetic: { M: toNum(di[4]), W: toNum(di[5]) }, sbp: { labels: g2.head.slice(1), M: sbpRows.M, W: sbpRows.W }, risk: table };
}
export function framinghamCalc(t, { female, age, tc, hdl, sbp, treated, smoker, diabetic }) {
  const sx = female ? "W" : "M", out = { parts: {}, ok: true };
  const ai = (age >= 30 && age <= 79) ? pickRange(t.age.map(x => x.label), age) : -1;
  const ti = pickRange(t.tc.map(x => x.label), tc), hi = pickRange(t.hdl.map(x => x.label), hdl), si = pickRange(t.sbp.labels, sbp);
  out.idx = { age: ai, tc: ti, hdl: hi, sbp: si };
  out.parts = { age: ai < 0 ? null : t.age[ai][sx], tc: ti < 0 ? null : t.tc[ti][sx], hdl: hi < 0 ? null : t.hdl[hi].pts, sbp: si < 0 ? null : t.sbp[sx][si][treated ? 1 : 0], smoker: smoker ? t.smoker[sx] : 0, diabetic: diabetic ? t.diabetic[sx] : 0 };
  out.ok = Object.values(out.parts).every(p => p != null); out.total = sum(Object.values(out.parts));
  if (out.ok) { // ≤−3 is the table's floor; above the last printed row the last row's value is shown as a floor
    const keys = [...t.risk.keys()], nums = keys.map(k => toNum(k)).filter(Number.isFinite), max = Math.max(...nums);
    const key = out.total <= -3 ? keys.find(k => /≤|<=/.test(k)) : out.total > max ? String(max) : String(out.total);
    const ent = t.risk.get(key), c = ent && ent[sx]; out.riskText = c ? c.v : null; out.riskLevel = c ? c.level : null; out.beyond = out.total > max;
    const r = parseRange(out.riskText); out.riskNum = r ? (r.lo === -Infinity ? r.hi - 0.5 : r.lo + (r.loInc === false ? 0.1 : 0)) : NaN;
    out.mgmt = !Number.isFinite(out.riskNum) ? -1 : out.riskNum < 10 ? 0 : out.riskNum < 20 ? 1 : 2;
  }
  return out;
}
