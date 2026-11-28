// Unit tests for tables.js (formula planning, solving, formatting) plus a cross-check of every computed table against the card's own formulas.
// Node:  node --experimental-default-type=module tests/tables.test.mjs
import { readFileSync } from "node:fs";
import { planFormulas, solve, fmt, lhsKey } from "../tables.js";

const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const C = { inf: load("infusion_calculator"), aa: load("adrenaline_infusion_adult"), ap: load("adrenaline_infusion_paeds"), ph: load("phenytoin_loading"),
  fe: load("iron_anaemia_paeds"), hu: load("hunter_serotonin_toxicity"), tx: load("toxidromes") };
let fails = 0;
const t = (name, fn) => { try { const r = fn(); if (r === true) console.log("ok  ", name); else { fails++; console.log("FAIL", name, "—", r === false ? "assertion false" : r); } } catch (e) { fails++; console.log("FAIL", name, "—", e.message); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const calcIds = d => planFormulas(d.formulas).filter(p => p.calc).map(p => p.id).join(",");
const num = s => +String(s).replace(/[^\d.]/g, "");

/* ----- planning: only plain arithmetic over declared vars is calculated ----- */
t("lhsKey reads mL/h, conc (mcg/mL), mg", () => lhsKey("mL/h") === "mlh" && lhsKey("conc (mcg/mL)") === "conc" && lhsKey("mg") === "mg" && lhsKey("mcg/kg/min") === null);
t("infusion: all 7 formulas calculate", () => calcIds(C.inf) === "conc,mlh_mcgkgmin,mlh_mgkgh,mlh_mgh,dose_back,vol_time,drops" || calcIds(C.inf));
t("iron: dose, Mentzer and ingested dose calculate; deferoxamine rate and Hb response are text", () => calcIds(C.fe) === "dose_ml,mentzer,ingested" || calcIds(C.fe));
t("infusion: four mL/h formulas do not feed the drops formula", () => { const p = planFormulas(C.inf.formulas); return p.filter(x => x.out === "mlh").every(x => !x.feeds) && p.find(x => x.id === "conc").feeds; });
t("Hunter: the AND/OR rule and the text doses are not calculated", () => calcIds(C.hu) === "" || calcIds(C.hu));
t("toxidromes: antidote text is not calculated", () => calcIds(C.tx) === "" || calcIds(C.tx));
t("phenytoin: 'total mL × 3' (unit word in the formula) is not calculated", () => !calcIds(C.ph).includes("child_rate") && calcIds(C.ph).includes("dose") || calcIds(C.ph));
t("iron: Mentzer matches MCV/RBC to mcv/rbc; '15 mg/kg/h IV' is text", () => { const c = calcIds(C.fe); return (c.includes("mentzer") && !c.includes("dfo")) || c; });

/* ----- solving ----- */
t("infusion: 10 mg in 1000 mL → 10 mcg/mL feeds mcg/kg/min → mL/h (0.1 × 70 kg = 42 mL/h)", () => {
  const r = solve(planFormulas(C.inf.formulas), { drug_mg: "10", vol: "1000", dose: "0.1", wt: "70" });
  return (r.results.conc === 10 && near(r.results.mlh_mcgkgmin, 42, 1e-9) && r.derived.conc === "conc") || JSON.stringify(r.results); });
t("a typed value beats a derived one", () => solve(planFormulas(C.inf.formulas), { drug_mg: "10", vol: "1000", conc: "20", dose: "0.1", wt: "70" }).results.mlh_mcgkgmin === 21);
t("negative and blank inputs, and division by 0, give no result", () => { const p = planFormulas(C.inf.formulas);
  return [{ wt: "-5", dose: "1", conc: "1" }, { wt: "", dose: "1", conc: "1" }, { wt: "70", dose: "1", conc: "0" }].every(v => Number.isNaN(solve(p, v).results.mlh_mcgkgmin)); });
t("0 is a valid entry: 2 × 55 mg tablets, 0 mL syrup, 10 kg = 11 mg/kg", () => solve(planFormulas(C.fe.formulas), { tabs: "2", syr_ml: "0", wt: "10" }).results.ingested === 11);
t("mL/h written in a formula reads the mlh var: 42 mL/h × 20 drops ÷ 60 = 14 drops/min; back-check 0.1 mcg/kg/min", () => { const r = solve(planFormulas(C.inf.formulas), { mlh: "42", conc: "10", wt: "70", df: "20" }).results; return (r.drops === 14 && near(r.dose_back, 0.1, 1e-9)) || JSON.stringify(r); });
t("Mentzer (no '=' in the formula): MCV 60 ÷ RBC 5 = 12", () => solve(planFormulas(C.fe.formulas), { mcv: "60", rbc: "5" }).results.mentzer === 12);
t("phenytoin 70 kg: 1400 mg, 28 mL, ≥ 28 min (mg feeds the next formulas)", () => { const r = solve(planFormulas(C.ph.formulas), { wt: "70" }).results; return (r.dose === 1400 && r.vial_ml === 28 && r.min_time_adult === 28) || JSON.stringify(r); });
t("fmt: 3 significant figures, whole numbers from 100", () => fmt(0.18) === "0.18" && fmt(41.666) === "41.7" && fmt(1400) === "1400" && fmt(NaN) === "—");

/* ----- every computed table agrees with the card's formulas ----- */
const tableCheck = (name, rows, expect, tol) => t(name, () => { const bad = []; rows.forEach((r, i) => expect(r).forEach(([got, want, what]) => { if (!near(num(got), want, tol(want))) bad.push(`row ${i + 1} ${what}: card ${got}, formula ${+want.toFixed(2)}`); })); return bad.length ? bad.join("; ") : true; });
const pct = p => w => Math.max(Math.abs(w) * p, 0.051);
{ const tb = C.aa.tables[0], wts = tb.head.slice(1).map(num);
  tableCheck("adrenaline adult: mL/h = 6 × kg × mcg/kg/min", tb.rows, r => wts.map((w, k) => [r[k + 1], 6 * w * num(r[0]), `${r[0]} mcg/kg/min at ${w} kg`]), pct(0.02)); }
{ const tb = C.ap.tables[0], wts = tb.head.slice(1).map(num);
  tableCheck("adrenaline child: mg = 0.06 × kg", [tb.rows[0]], r => wts.map((w, k) => [r[k + 1], 0.06 * w, `${w} kg`]), () => 0.006); }
{ const tb = C.inf.tables[0];
  tableCheck("drip table: drops = mL/h ÷ 3, microdrops = mL/h, hours per litre = 1000 ÷ mL/h", tb.rows, r => [[r[1], num(r[0]) / 3, "drops/min"], [r[2], num(r[0]), "microdrops"], [r[3], 1000 / num(r[0]), "h per L"]], pct(0.01)); }
{ const [ad, ch] = C.ph.tables;
  tableCheck("phenytoin adult: mg, mL, minimum minutes, maximum mL/h", ad.rows, r => { const kg = num(r[0]), mg = 20 * kg, ml = mg / 50, min = mg / 50;
    return [[r[1], mg, "mg"], [r[2], ml, "mL"], [r[4], min, "min"], [r[5], (200 + ml) / min * 60, "mL/h"]]; }, pct(0.01));
  tableCheck("phenytoin child: mg, mL, total ≤ 10 mg/mL, mL/h over 20 min", ch.rows, r => { const kg = num(r[0]), mg = 20 * kg, tot = mg / 10;
    return [[r[1], mg, "mg"], [r[2], mg / 50, "mL drug"], [r[4], tot, "total mL"], [r[5], tot * 3, "mL/h"]]; }, pct(0.01)); }

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exitCode = fails ? 1 : 0;
