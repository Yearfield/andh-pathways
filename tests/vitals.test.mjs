// Unit tests for the urine dipstick, adult NEWS2 and paediatric vitals rules (calc.js), run against the real card JSON.
// Node:  node tests/vitals.test.mjs      Browser: import the module and call run()
import * as C from "../calc.js";

async function load(id) {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFileSync } = await import("node:fs"); return JSON.parse(readFileSync(new URL(`../data/${id}.json`, import.meta.url), "utf8"));
  }
  return (await fetch(new URL(`../data/${id}.json`, import.meta.url))).json();
}
export async function run() {
  const dip = await load("urine-dipstick"), ad = await load("vitals-adult"), pa = await load("vitals-paeds"), out = [];
  const t = (name, fn) => { try { const r = fn(); out.push({ name, ok: r !== false, err: r === false ? "assertion false" : "" }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };
  const on = a => a.map((x, i) => x ? i : -1).filter(i => i >= 0).join();

  /* ----- urine dipstick ----- */
  t("Dipstick: LEU ++ and NIT Pos -> patterns 1 and 2 (not 0)", () => on(C.dipPatterns({ LEU: "++", NIT: "Pos" })) === "1,2");
  t("Dipstick: all Neg -> pattern 0 only", () => on(C.dipPatterns({ LEU: "Neg", NIT: "Neg", PRO: "Neg", BLD: "Neg", GLU: "Neg", KET: "Neg", BIL: "Neg", URO: "Norm" })) === "0");
  t("Dipstick: BLD Tr + PRO + -> 3; GLU Tr + KET Tr -> 4; BIL + with URO Norm -> 5; unread pads match nothing", () =>
    on(C.dipPatterns({ BLD: "Tr", PRO: "+" })) === "3" && on(C.dipPatterns({ GLU: "Tr", KET: "Tr" })) === "4" && on(C.dipPatterns({ BIL: "+", URO: "Norm" })) === "5" && on(C.dipPatterns({})) === "");
  t("Dipstick: LEU Tr alone -> pattern 1 only (LEU ≥ + needed for 2)", () => on(C.dipPatterns({ LEU: "Tr", NIT: "Neg" })) === "1");
  t("Dipstick: PH and SG are never abnormal; other pads abnormal beyond the first chip", () => !C.padAbnormal("PH", 3) && !C.padAbnormal("SG", 4) && C.padAbnormal("LEU", 1) && !C.padAbnormal("LEU", 0) && !C.padAbnormal("URO", 0) && C.padAbnormal("URO", 1) && !C.padAbnormal("GLU", null));
  t("Dipstick JSON: 10 pads in order, first chip is the normal grade, 6 patterns", () =>
    dip.components.map(c => c.key).join() === "LEU,NIT,URO,PRO,PH,BLD,SG,KET,BIL,GLU" && dip.patterns.length === 6 && dip.components.every(c => c.items.length >= 3 && c.read)
    && ["LEU", "NIT", "PRO", "BLD", "KET", "BIL", "GLU"].every(k => /^Neg$/.test(dip.components.find(c => c.key === k).items[0].grade)) && dip.components.find(c => c.key === "URO").items[0].grade === "Norm");
  t("Dipstick grade ranks match every pad that the rules use", () => ["LEU", "PRO", "BLD", "KET", "BIL", "GLU"].every(k => dip.components.find(c => c.key === k).items.every(i => C.GRADE_RANK.includes(i.grade))));
  t("Pregnancy pins MAT24 and HOSP:6.x lines (NIT, PRO, KET, GLU), not other sources", () => {
    const pin = dip.components.flatMap(c => c.means.filter(m => C.isPregnancyLine(m.s)).map(m => c.key)); return pin.join() === "NIT,PRO,KET,GLU" && !C.isPregnancyLine("HOSP:7.7") && !C.isPregnancyLine("PHC:6.1"); });

  /* ----- adult NEWS2 ----- */
  const base = { rr: 26, spo2: 95, scale2: false, o2: false, sbp: 105, hr: 115, cns: false, temp: 38.5 };
  t("NEWS2: RR 26, SpO₂ 95 (scale 1), air, SBP 105, HR 115, Alert, T 38.5 -> 3+1+0+1+2+0+1 = 8 -> High", () => {
    const r = C.news2(ad, base), b = ad.interpretation_classic[r.band];
    return r.total === 8 && r.complete && r.parts.RR.score === 3 && r.parts.SPO2.score === 1 && r.parts.O2.score === 0 && r.parts.SBP.score === 1 && r.parts.HR.score === 2 && r.parts.CNS.score === 0 && r.parts.T.score === 1 && /^High/.test(b.t) && b.level === "red"; });
  t("MAP for 105/60 = 75", () => C.mapOf(105, 60) === 75);
  t("NEWS2: RR 18 but SpO₂ 90 -> single-3 flag (SpO₂ scores 3)", () => { const r = C.news2(ad, { ...base, rr: 18, spo2: 90 }); return r.parts.SPO2.score === 3 && r.single3; });
  t("NEWS2: no single 3 -> flag off; 12-20 RR scores 0", () => { const r = C.news2(ad, { ...base, rr: 14, hr: 80, temp: 37, spo2: 98, sbp: 130 }); return !r.single3 && r.total === 0 && /12-hourly/.test(ad.interpretation_classic[r.band].t); });
  t("NEWS2 bands inclusive with open ends: RR 8 -> 3, 9 -> 1, 20 -> 0, 21 -> 2, 25 -> 3; SBP 220 -> 3; HR 40 -> 3", () => {
    const s = (k, v) => C.bandOf(ad.components.find(c => c.key === k).items, v), sc = (k, v) => ad.components.find(c => c.key === k).items[s(k, v)].score;
    return sc("RR", 8) === 3 && sc("RR", 9) === 1 && sc("RR", 20) === 0 && sc("RR", 21) === 2 && sc("RR", 25) === 3 && sc("SBP", 220) === 3 && sc("SBP", 111) === 0 && sc("HR", 40) === 3 && sc("HR", 131) === 3 && sc("SPO2", 96) === 0; });
  t("NEWS2: temperature is rounded to 0.1 so 38.05 does not fall between bands; oxygen scores 2; confusion scores 3", () => {
    const r = C.news2(ad, { ...base, temp: 38.05, o2: true, cns: true }); return r.parts.T.score !== null && r.parts.O2.score === 2 && r.parts.CNS.score === 3; });
  t("NEWS2 Scale 2: the SpO₂ points come from the hand-picked value (the card has no Scale 2 bands)", () => {
    const r = C.news2(ad, { ...base, scale2: true, spo2Points: 0 }), u = C.news2(ad, { ...base, scale2: true }); return r.parts.SPO2.score === 0 && r.total === 7 && u.parts.SPO2.score === null && !u.complete && /88–92/.test(ad.components.find(c => c.key === "SPO2").note); });
  t("NEWS2 response bands (min/max inclusive): 0 low 12-hourly · 1–4 low 4–6-hourly · 5–6 medium · ≥7 high", () => {
    const text = tot => { const b = ad.interpretation_classic.findIndex(x => !x.single3 && tot >= x.min && tot <= x.max); return b < 0 ? "" : ad.interpretation_classic[b].t; };
    return /12-hourly/.test(text(0)) && /4–6-hourly/.test(text(1)) && /4–6-hourly/.test(text(4)) && /^Medium/.test(text(5)) && /^Medium/.test(text(6)) && /^High/.test(text(7)) && /^High/.test(text(20)); });
  t("Adult flags: SpO₂ <94 -> oxygen; SBP ≥140 or DBP ≥90 -> hypertension; RR <12 -> sedation; pregnancy -> EWC and ≥160/≥110", () => {
    const a = C.adultFlags({ spo2: 93, sbp: 120, dbp: 70, rr: 18 }), b = C.adultFlags({ spo2: 98, sbp: 150, dbp: 70, rr: 11 }), p = C.adultFlags({ spo2: 98, sbp: 160, dbp: 80, rr: 16, pregnant: true }), q = C.adultFlags({ spo2: 98, sbp: 150, dbp: 100, rr: 16, pregnant: true });
    return a.oxygen && !a.hypertension && b.hypertension && b.sedation && !b.oxygen && p.ewc && p.severePreg && !p.hypertension && !q.severePreg && C.adultFlags({ spo2: 90, scale2: true }).oxygen === false; });
  t("Haemodynamics: shock index 115/105 > 1; narrow pulse pressure < 25 % of SBP", () => C.shockIndex(115, 105) > 1 && C.shockIndex(80, 120) < 1 && C.narrowPulsePressure(100, 80) && !C.narrowPulsePressure(120, 70) && C.pulsePressure(105, 60) === 45);
  t("Adult JSON: 7 components, related[] lines in the order the rules use, formulas present", () =>
    ad.components.map(c => c.key).join() === "RR,SPO2,O2,SBP,HR,CNS,T" && /^SpO₂/.test(ad.related[0].t) && /^Hypertension/.test(ad.related[1].t) && /≥ 160/.test(ad.related[2].t) && /early warning chart/i.test(ad.related[3].t) && /^RR < 12/.test(ad.related[4].t)
    && ["news2", "map", "shock_index", "pulse_pressure"].every(id => ad.formulas.some(f => f.id === id)) && ad.interpretation_classic.some(b => b.single3));

  /* ----- paediatric vitals ----- */
  const m = (v, u) => C.ageMonths(v, u);
  t("Paeds age picker: days / months / years -> months", () => Math.abs(m(30.4375, "d") - 1) < 1e-9 && m(18, "m") === 18 && m(4, "y") === 48);
  t("Paeds row: the highest age row ≤ the child's age (Term for 0–2 mo, 17 y + from 17 y)", () => {
    const row = mo => pa.ranges[C.paedsRowIdx(pa.ranges, mo)].age;
    return row(0) === "Term" && row(2) === "Term" && row(3) === "3 mo" && row(5) === "3 mo" && row(6) === "6 mo" && row(12) === "1 y" && row(47) === "2 y" && row(48) === "4 y" && row(60) === "4 y" && row(72) === "6 y" && row(17 * 12) === "17 y +" && row(20 * 12) === "17 y +" && C.paedsRowIdx(pa.ranges, NaN) === -1; });
  t("Paeds: 4 y, RR 45 -> above range (17–30) and tachypnoea (> 40, PAED 1–5 y)", () => {
    const r = pa.ranges[C.paedsRowIdx(pa.ranges, 48)], lim = C.tachypnoeaLimit(pa.related[0].t, 48);
    return r.age === "4 y" && C.rangeStatus(45, r.rr) === "above" && lim === 40 && 45 > lim && C.rangeStatus(30, r.rr) === "within" && C.rangeStatus(16, r.rr) === "below"; });
  t("Paeds: 4 y hypotension limit = 70 + 2 × 4 = 78; SBP 75 is within the 75–110 table range but below 78 -> hypotension flag", () => {
    const h = C.paedsHypotension(48), r = pa.ranges[C.paedsRowIdx(pa.ranges, 48)]; return h.threshold === 78 && h.id === "sbp_min" && C.rangeStatus(75, r.sbp) === "within" && 75 < h.threshold && !(78 < h.threshold); });
  t("Paeds hypotension rules: 1–10 y 70 + 2 × age; < 1 y 70; term neonate 60; none from 11 y", () =>
    C.paedsHypotension(12).threshold === 72 && C.paedsHypotension(10 * 12).threshold === 90 && C.paedsHypotension(6).threshold === 70 && C.paedsHypotension(2).threshold === 60 && C.paedsHypotension(0).threshold === 60 && C.paedsHypotension(11 * 12) === null && C.paedsHypotension(NaN) === null);
  t("Paeds weight estimate (age + 4) × 2 for 1–10 y only", () => C.weightEstimate(48) === 16 && C.weightEstimate(12) === 10 && C.weightEstimate(10 * 12) === 28 && C.weightEstimate(6) === null && C.weightEstimate(11 * 12) === null);
  t("Paeds tachypnoea limits parsed from the STG sentence: <60 d 60 · 2–12 mo 50 · 1–5 y 40 · 5–12 y 25", () => {
    const L = mo => C.tachypnoeaLimit(pa.related[0].t, mo); return C.parseTachypnoea(pa.related[0].t).length === 4 && L(0.5) === 60 && L(1.9) === 60 && L(3) === 50 && L(11) === 50 && L(12) === 40 && L(48) === 40 && L(60) === 25 && L(11 * 12) === 25 && L(13 * 12) === null; });
  t("Paeds JSON: 13 age rows in ascending order with min < max, weights, formulas, related[] lines", () => {
    const ages = pa.ranges.map(r => C.parseAgeLabel(r.age)); return pa.ranges.length === 13 && ages.every((a, i) => Number.isFinite(a) && (i === 0 || a > ages[i - 1]))
      && pa.ranges.every(r => r.hr.min < r.hr.max && r.rr.min < r.rr.max && r.sbp.min < r.sbp.max && r.weight_kg > 0) && ["wt_apls", "sbp_min", "sbp_min_inf"].every(id => pa.formulas.some(f => f.id === id))
      && /^Tachypnoea/.test(pa.related[0].t) && /92/.test(pa.related[1].t) && /CRT/.test(pa.related[2].t) && /SATS/.test(pa.related[3].t); });
  t("Source marks: d=false lines are SA guideline ids (PHC/HOSP/PAED/MAT24); d=true lines are not", () => {
    const all = []; (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === "object") { if ("s" in o && "d" in o) all.push(o); Object.values(o).forEach(w); } })([dip, ad, pa]);
    const sa = s => /^(HOSP|MAT24|PHC|PAED)(:|$)/.test(s); return all.length > 60 && all.every(o => (o.d === false) === sa(o.s)); });
  return out;
}

if (typeof process !== "undefined" && process.versions?.node && import.meta.url === new URL(process.argv[1], "file://").href) {
  const res = await run(); res.forEach(r => console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.err ? "  — " + r.err : "")));
  process.exit(res.every(r => r.ok) ? 0 : 1);
}
