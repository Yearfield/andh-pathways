// Unit tests for anthro.js (formula evaluator, band mapping, params) and the WHO z-score engine, run against the real card JSON + who_lms.json.
// Browser: import the module and call run()
import { evalExpr, canEval, bandTest, bandIndex, zBand, paedsParams } from "../anthro.js";

const J = async p => (await fetch(new URL(`../${p}`, import.meta.url))).json();
export async function run() {
  const [a05, a519, ad, lms] = await Promise.all([J("data/anthropometry_paeds_0_5.json"), J("data/anthropometry_paeds_5_19.json"), J("data/anthropometry_adult.json"), J("data/who_lms.json")]);
  const src = await (await fetch(new URL("../anthro_z.js", import.meta.url))).text();
  const AZ = new Function(`const module={exports:{}};(function(){${src}}).call({});return module.exports;`)();
  const out = [], t = (name, fn) => { try { const r = fn(); out.push({ name, ok: r !== false, err: r === false ? "assertion false" : "" }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };
  const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
  const comp = (d, k) => d.components.find(c => c.key === k);

  /* ----- evaluator ----- */
  t("evalExpr: BMI formula from the adult card", () => near(evalExpr(ad.formulas.find(f => f.id === "bmi").expr, { weight_kg: 70, height_cm: 175 }), 22.857, 0.001));
  t("evalExpr: unicode minus/times, precedence, ^ right-assoc, unary minus", () => evalExpr("2 + 3 × 4", {}) === 14 && evalExpr("2^3^2", {}) === 512 && evalExpr("−2^2", {}) === -4 && evalExpr("(1 − 3) × 2", {}) === -4);
  t("evalExpr: IBW male/female, ABW, BSA, % weight loss", () => {
    const f = id => ad.formulas.find(x => x.id === id).expr, v = { weight_kg: 120, height_cm: 170, usual_weight: 130 };
    const ibwM = evalExpr(f("ibw_m"), v), ibwF = evalExpr(f("ibw_f"), v);
    return near(ibwM, 50 + 0.91 * (170 - 152.4), 1e-9) && near(ibwF, ibwM - 4.5, 1e-9) && near(evalExpr(f("abw"), { ...v, IBW: ibwM }), ibwM + 0.4 * (120 - ibwM), 1e-9)
      && near(evalExpr(f("bsa"), v), Math.sqrt(170 * 120 / 3600), 1e-9) && near(evalExpr(f("wt_loss"), v), 7.6923, 0.001); });
  t("evalExpr: missing variable gives NaN; bad text throws; no code execution", () => Number.isNaN(evalExpr("a + 1", {})) && !canEval("alert(1)", {}) && !canEval("1 +", {}) && !canEval("2 $ 3", {}));
  t("evalExpr: functions are whitelisted", () => evalExpr("sqrt(16)", {}) === 4 && !canEval("process(1)", {}) && !canEval("eval(1)", {}));
  t("Adult card: every formula evaluates except the prose tidal-volume line", () => { const v = { weight_kg: 80, height_cm: 175, usual_weight: 85, IBW: 70 };
    const bad = ad.formulas.filter(f => !canEval(f.expr, v) || Number.isNaN(evalExpr(f.expr, v))).map(f => f.id); return bad.join() === "vt" || (console.warn(bad), false); });

  /* ----- bands ----- */
  t("bandTest handles the card's band texts", () => bandTest("< 16")(15.9) && !bandTest("< 16")(16) && bandTest("16 – < 18.5")(18.4) && !bandTest("16 – < 18.5")(18.5) && bandTest("≥ 30")(30) && bandTest("> 10%")(10.1) && !bandTest("> 10%")(10)
    && bandTest("Below −3")(-3.01) && bandTest("−3 to < −2")(-3) && !bandTest("−3 to < −2")(-2) && bandTest("≥ 94 cm men")(94) && bandTest("≥ −2")(-2) && bandTest("11.5 – 12.5 cm")(12.5));
  t("Adult BMI bands: 15 red, 17 amber, 22 green, 25 amber (last match wins), 30 red", () => { const it = comp(ad, "BMI").items, lv = x => it[bandIndex(it, x)].level;
    return lv(15) === "red" && lv(17) === "amber" && lv(22) === "green" && lv(25) === "amber" && lv(27) === "amber" && lv(30) === "red" && lv(41) === "red"; });
  t("0–5 WFA z bands: −3.5 red, −3 / −2.5 amber, −2 .. +2 green", () => { const it = comp(a05, "WFA").items, lv = z => it[zBand("WFA", it, z)]?.level;
    return lv(-3.5) === "red" && lv(-3) === "amber" && lv(-2.5) === "amber" && lv(-2) === "green" && lv(0) === "green" && lv(2) === "green"; });
  t("0–5 WFL/H: −3.1 red SAM, −2.5 amber MAM, 0 green, 1.5 blue, 2.5 / 3.5 amber", () => { const it = comp(a05, "WFL/H").items, lv = z => it[zBand("WFL/H", it, z)]?.level;
    return lv(-3.1) === "red" && lv(-2.5) === "amber" && lv(0) === "green" && lv(1.5) === "blue" && lv(2.5) === "amber" && lv(3.5) === "amber" && lv(1) === "green"; });
  t("0–5 BMI/A: > +2 amber, > +3 red, below +2 none", () => { const it = comp(a05, "BMI/A").items, lv = z => it[zBand("BMI/A", it, z)]?.level; return lv(2.5) === "amber" && lv(3.5) === "red" && lv(1) === undefined; });
  t("5–19 BMI/A: −3.5 red, −2.5 amber, 0 green, 1.5 amber overweight, 2.5 red obese", () => { const it = comp(a519, "BMI/A").items, lv = z => it[zBand("BMI/A", it, z)]?.level;
    return lv(-3.5) === "red" && lv(-2.5) === "amber" && lv(0) === "green" && lv(1.5) === "amber" && lv(2.5) === "red"; });
  t("5–19 WFA: the '> 10 y' age band is never matched by a z-score", () => { const it = comp(a519, "WFA").items; return zBand("WFA", it, 5) === -1 && zBand("WFA", it, -3.5) === 0; });
  t("Every band text on the three cards is understood by bandTest", () => {
    const odd = []; [a05, a519, ad].forEach(d => d.components.forEach(c => c.items.forEach(it => { if (!bandTest(it.band)) odd.push(`${d.id}/${c.key}: ${it.band}`); })));
    return odd.length === 0 || (console.warn(odd), false); });

  /* ----- params ----- */
  t("paedsParams: asks for missing fields, rejects reversed dates and bad GA", () =>
    !!paedsParams({}, true).wait && !!paedsParams({ dob: "2024-01-01", date: "2023-01-01", sex: "1" }, true).error
    && !!paedsParams({ dob: "2024-01-01", date: "2024-06-01", sex: "1", preterm: "1" }, true).wait
    && !!paedsParams({ dob: "2024-01-01", date: "2024-06-01", sex: "1", preterm: "1", ga_weeks: "40" }, true).error
    && paedsParams({ dob: "2024-01-01", date: "2024-06-01", sex: "2", preterm: "1", ga_weeks: "32", weight: "6.5", lenhei: "62" }, true).p.gaWeeks === 32);
  t("paedsParams: ga_weeks is ignored when premature is No", () => paedsParams({ dob: "2024-01-01", date: "2024-06-01", sex: "1", preterm: "0", ga_weeks: "30" }, true).p.gaWeeks === null);

  /* ----- engine (anthro_z.js + who_lms.json) ----- */
  t("WHO 2006: median 12-month boy weight is z ~ 0, about 7.7 kg is z ~ -2", () => { const c = w => AZ.compute(lms, { sex: 1, ageDays: 365, weightKg: w, lenheiCm: 75.7 }).z.wfa; return near(c(9.6), 0, 0.05) && near(c(7.7), -2, 0.15); });
  t("WHO 2006 girl 6 months 6.0 kg / 63.5 cm returns WFA, L/HFA and WFL/H", () => { const r = AZ.compute(lms, { sex: 2, ageDays: 183, weightKg: 6.0, lenheiCm: 63.5 }); return r.table === "WHO 2006" && r.z.wfa > -2 && r.z.wfa < 0.5 && r.z.lhfa > -1.5 && r.z.lhfa < 1 && r.z.wflh != null; });
  t("Preterm correction: 32 wk at 6 months uses corrected age (minus 56 days) and says so", () => { const r = AZ.compute(lms, { sex: 1, ageDays: 183, gaWeeks: 32, weightKg: 6, lenheiCm: 63 }); return r.corrected && near(r.ageDaysUsed, 127, 0.01) && r.notes.some(n => /Corrected/.test(n)); });
  t("No correction at 24 months or more, or GA 37 and over", () => !AZ.compute(lms, { sex: 1, ageDays: 800, gaWeeks: 30, weightKg: 12, lenheiCm: 85 }).corrected && !AZ.compute(lms, { sex: 1, ageDays: 100, gaWeeks: 37, weightKg: 5, lenheiCm: 58 }).corrected);
  t("Oedema: no weight-based z, note given", () => { const r = AZ.compute(lms, { sex: 1, ageDays: 365, weightKg: 7, lenheiCm: 75, oedema: true }); return r.z.wfa == null && r.z.wflh == null && r.z.bfa == null && r.z.lhfa != null && r.notes.some(n => /Oedema/.test(n)); });
  t("Implausible values are flagged", () => AZ.compute(lms, { sex: 1, ageDays: 365, weightKg: 30, lenheiCm: 75 }).flags.wfa !== undefined);
  t("WHO 2007: 10-year-old girl has BMI, HFA, WFA; over 10 y gives the use-BMI note and no WFA", () => {
    const a = AZ.compute(lms, { sex: 2, dob: "2014-06-01", date: "2024-05-01", weightKg: 32, lenheiCm: 138 }), b = AZ.compute(lms, { sex: 2, dob: "2010-01-01", date: "2024-06-02", weightKg: 50, lenheiCm: 160 });
    return a.table === "WHO 2007" && a.z.bfa != null && a.z.hfa != null && a.z.wfa != null && b.z.wfa == null && b.notes.some(n => /use BMI/.test(n)) && b.z.bfa != null; });
  t("End to end: a child with WHZ below -3 lands on the red SAM band", () => { const r = AZ.compute(lms, { sex: 1, ageDays: 365, weightKg: 6.0, lenheiCm: 75 }), it = comp(a05, "WFL/H").items; return r.z.wflh < -3 && it[zBand("WFL/H", it, r.z.wflh)].level === "red"; });

  return out;
}
