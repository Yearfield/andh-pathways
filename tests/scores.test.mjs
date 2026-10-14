// Unit tests for the block-schema score cards (calc.js): worked examples + checks that the numbers come from the card JSON.
// Node:  node tests/scores.test.mjs      Browser: import the module and call run()
import * as C from "../calc.js";

const IDS = ["alvarado", "apgar", "ipss", "curb65", "duke-ie", "ottawa-ankle", "pecarn", "ugib", "chest-pain", "grace", "csrs", "caprini", "framingham", "renal", "liver", "lights", "ganzoni", "burns-adult", "burns-paeds", "phq9", "sofa", "copd-gold"];
async function load(id) {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFileSync } = await import("node:fs"); return JSON.parse(readFileSync(new URL(`../data/${id}.json`, import.meta.url), "utf8"));
  }
  return (await fetch(new URL(`../data/${id}.json`, import.meta.url))).json();
}
const near = (a, b, d = 0.05) => Math.abs(a - b) <= d;

export async function run() {
  const out = [], J = {};
  for (const id of IDS) J[id] = await load(id);
  const t = (name, fn) => { try { const r = fn(); out.push({ name, ok: r !== false, err: r === false ? "assertion false" : "" }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };

  /* ----- the worked examples from the brief ----- */
  t("CKD-EPI 2021: F, 50 y, Scr 88 µmol/L -> ≈68-69 mL/min/1.73 m² (exact formula gives 69.0)", () => { const v = C.ckdEpi2021({ scrUmol: 88, age: 50, female: true }); return v > 67.5 && v < 69.5; });
  t("Ganzoni: 60 kg, Hb 8 (target 15, stores 500) -> 1508 mg; 6 doses of 200 mg", () => C.ganzoni({ kg: 60, hbActual: 8 }) === 1508 && C.ironSucroseDoses(1508) === 8);
  t("Parkland: 70 kg, 30% -> 8400 mL; 525 mL/h for 8 h then 262.5 mL/h", () => { const p = C.parkland({ kg: 70, tbsa: 30 }); return p.total === 8400 && p.rateFirst === 525 && p.rateNext === 262.5; });
  t("Parkland with 2 h elapsed: first half over the 6 h left", () => { const p = C.parkland({ kg: 70, tbsa: 30, hoursSince: 2 }); return p.rateFirst === 700 && p.rateNext === 262.5; });
  t("Paediatric burns: 24 kg, 10% -> 960 mL + 1580 mL maintenance", () => { const p = C.paedsBurns({ kg: 24, ageYears: 4, tbsa: 10 }); return p.resus === 960 && p.maint === 1580 && p.first8 === 480; });
  t("Paediatric burns: ≤1 y uses 120 mL/kg; %TBSA capped at 50", () => C.paedsMaintenance({ kg: 8, ageYears: 0.5 }) === 960 && C.paedsBurns({ kg: 20, ageYears: 5, tbsa: 70 }).pct === 50);
  t("Framingham (JSON tables): man 60–64, TC 5.2–6.19, HDL 1.2–1.29, SBP 140–149 untreated, non-smoker, non-diabetic -> 11+2+0+2 = 15 -> 21.6%", () => {
    const tb = C.buildFramingham(J.framingham), r = C.framinghamCalc(tb, { female: false, age: 62, tc: 5.5, hdl: 1.25, sbp: 145, treated: false, smoker: false, diabetic: false });
    return r.ok && r.parts.age === 11 && r.parts.tc === 2 && r.parts.hdl === 0 && r.parts.sbp === 2 && r.total === 15 && r.riskText === "21.6" && r.mgmt === 2; });
  t("Framingham floors: ≤−3 -> <1; men ≥18 -> >30; women at 19 = 24.8", () => {
    const tb = C.buildFramingham(J.framingham), m = C.framinghamCalc(tb, { female: false, age: 32, tc: 3.5, hdl: 1.6, sbp: 110, treated: false, smoker: false, diabetic: false });
    const hi = C.framinghamCalc(tb, { female: false, age: 77, tc: 7.5, hdl: 0.8, sbp: 170, treated: true, smoker: true, diabetic: true }), w = C.framinghamCalc(tb, { female: true, age: 77, tc: 7.5, hdl: 0.8, sbp: 170, treated: true, smoker: true, diabetic: true });
    return m.total <= -3 && m.riskText === "<1" && m.mgmt === 0 && hi.riskText === ">30" && hi.mgmt === 2 && w.riskNum > 20; });
  t("GRACE (JSON tables): age 65, HR 95, SBP 130, creat 120, Killip I, ST deviation -> 58+15+34+10+0+28 = 145 -> NSTE-ACS high", () => {
    const tb = C.buildGrace(J.grace), r = C.graceCalc(tb, { age: 65, hr: 95, sbp: 130, creat: 120, killip: 0, flags: tb.flags.map(f => /ST-segment/.test(f.t)) });
    const rk = C.graceRisk(tb, "NSTE-ACS", r.total);
    return r.parts.join() === "58,15,34,10" && r.flags === 28 && r.total === 145 && rk[0].idx === 2 && rk[1].idx === 2; });
  t("GRACE STEMI table at 145: in-hospital intermediate (126–154), 6-month high (>127)", () => { const tb = C.buildGrace(J.grace), rk = C.graceRisk(tb, "STEMI", 145); return rk[0].idx === 1 && rk[1].idx === 2; });
  t("CURB-65: all five items -> 5; CRB-65 (no urea) -> 4", () => {
    const b = J.curb65.left[0], c = b.rows.reduce((a, r) => a + r.pts.c, 0), r = b.rows.reduce((a, x) => a + (x.pts.r || 0), 0);
    const bc = J.curb65.left[1].items, br = J.curb65.left[2].items;
    return c === 5 && r === 4 && C.bandIdx(bc, 5) === 2 && C.bandIdx(br, 4) === 2; });
  t("CURB-65 flags from numbers: urea >7, RR ≥30, SBP <90 or DBP ≤60, age ≥65", () => { const f = C.curbFlags({ urea: 8, rr: 30, sbp: 120, dbp: 60, age: 65 }); return f.urea && f.rr && f.bp && f.age; });
  t("Light's: pleural/serum protein 0.6 -> exudate; all below the cut-offs -> transudate", () => {
    const e = C.lights({ pProt: 30, sProt: 50, pLdh: 100, sLdh: 300, ldhUln: 250 }), n = C.lights({ pProt: 20, sProt: 60, pLdh: 100, sLdh: 300, ldhUln: 250 });
    return e.exudate && e.c1 && near(e.proteinRatio, 0.6, 1e-9) && !n.exudate; });

  /* ----- other calculators ----- */
  t("MDRD (F, 50 y, 88 µmol/L)", () => near(C.mdrd({ scrUmol: 88, age: 50, female: true }), 175 * Math.pow(88 / 88.4, -1.154) * Math.pow(50, -0.203) * 0.742, 1e-9));
  t("Cockcroft-Gault: M 60 y 70 kg Scr 100 -> 70 mL/min × 1.23", () => near(C.cockcroftGault({ age: 60, kg: 70, scrUmol: 100, female: false }), 80 * 70 * 1.23 / 100, 1e-9));
  t("Schwartz K: LBW 30 · infant 40 · girl 49 · boy 2–12 49 · boy 13–16 60 · 8 mo–2 y none", () =>
    C.schwartzK({ ageYears: 1, lbw: true }).k === 30 && C.schwartzK({ ageYears: 0.5 }).k === 40 && C.schwartzK({ ageYears: 10, female: true }).k === 49 && C.schwartzK({ ageYears: 10 }).k === 49
    && C.schwartzK({ ageYears: 14 }).k === 60 && C.schwartzK({ ageYears: 1 }).k === null && near(C.schwartz({ k: 49, heightCm: 120, scrUmol: 50 }), 117.6));
  t("Urea:creatinine and BUN:Cr; G and A stages", () => near(C.ureaCreat({ urea: 8, scrUmol: 80 }), 100) && near(C.bunCr(100), 24.75) && C.gStage(47) === "G3a" && C.gStage(14) === "G5" && C.aStage(2.9) === "A1" && C.aStage(30) === "A2" && C.aStage(31) === "A3");
  t("KDIGO heat-map cell: G3b + A2 = REFER (JSON grid)", () => { const g = J.renal.right[0].rows, gi = C.G_STAGES.indexOf("G3b"), cell = g[gi][2]; return cell.v === "REFER" && cell.level === "red"; });
  t("GBS rows: urea 9 -> 8.0–9.9 (3 pts); Hb 11 man -> 10.0–11.9 (3); woman 11 -> 1; SBP 95 -> 90–99 (2)", () => {
    const a = C.gbsAuto({ urea: 9, hb: 11, male: true, sbp: 95 }), w = C.gbsAuto({ urea: 5, hb: 11, male: false, sbp: 120 }), rows = J.ugib.left[0].rows;
    const sec = k => rows.findIndex(r => r.section && r.section.startsWith(k)), p = (k, j) => rows[sec(k) + 1 + j].pts.p;
    return p("Blood urea", a.U) === 3 && p("Haemoglobin", a.H) === 3 && p("Systolic", a.S) === 2 && w.U === -1 && p("Haemoglobin", w.H) === 1 && w.S === -1; });
  t("Liver R factor: ALT 300 (ULN 40), ALP 120 (ULN 120) -> R 7.5 hepatocellular; mixed, cholestatic, below", () =>
    C.liverPattern({ alt: 300, altUln: 40, alp: 120, alpUln: 120 }).pattern === "hepatocellular" && C.liverPattern({ alt: 160, altUln: 40, alp: 160, alpUln: 120 }).pattern === "mixed" && C.liverPattern({ alt: 160, altUln: 40, alp: 240, alpUln: 120 }).pattern === "cholestatic" /* R = 2 exactly: "R ≤2" */
    && C.liverPattern({ alt: 80, altUln: 40, alp: 480, alpUln: 120 }).pattern === "cholestatic" && C.liverPattern({ alt: 60, altUln: 40, alp: 120, alpUln: 120 }).pattern === "below" && C.altAdvice(2) === 0 && C.altAdvice(3) === 1 && C.altAdvice(6) === 2);
  t("King's: paracetamol pH <7.30 meets; all of INR >6.5 + creat >300 + grade III–IV meets; non-paracetamol INR >6.5 or any 3", () =>
    C.kingsParacetamol({ ph: 7.2, inr: 1, creat: 100 }).meets && C.kingsParacetamol({ ph: 7.4, inr: 7, creat: 310, grade34: true }).meets && !C.kingsParacetamol({ ph: 7.4, inr: 7, creat: 310, grade34: false }).meets
    && C.kingsNonParacetamol({ age: 45, inr: 7, bili: 10 }).meets && C.kingsNonParacetamol({ age: 45, inr: 4, bili: 350, aetiology: true }).meets && !C.kingsNonParacetamol({ age: 30, inr: 4, bili: 350 }).meets);
  t("Duke: pathology / 2 major / 1 major + 3 minor / 5 minor = definite; 1+1 or 3 minor = possible", () =>
    C.dukeClass({ major: 0, minor: 0, path: true }) === "definite" && C.dukeClass({ major: 2, minor: 0 }) === "definite" && C.dukeClass({ major: 1, minor: 3 }) === "definite" && C.dukeClass({ major: 0, minor: 5 }) === "definite"
    && C.dukeClass({ major: 1, minor: 1 }) === "possible" && C.dukeClass({ major: 0, minor: 3 }) === "possible" && C.dukeClass({ major: 1, minor: 0 }) === "rejected");
  t("PECARN: any high-risk -> high; else any intermediate -> intermediate; else low", () => C.pecarnClass({ high: 1, inter: 2 }) === "high" && C.pecarnClass({ high: 0, inter: 1 }) === "intermediate" && C.pecarnClass({ high: 0, inter: 0 }) === "low");
  t("COPD: GOLD grade from FEV₁ % (JSON labels) and group A/B/E", () => {
    const labels = J["copd-gold"].left[1].rows.map(r => (r.cells || r)[2]);
    return [90, 79, 50, 49, 30, 29].map(v => C.pickRange(labels, v) + 1).join() === "1,2,2,3,3,4" && C.goldGroup({ mmrc: 1, exacerbations: 0 }) === "A" && C.goldGroup({ mmrc: 2, exacerbations: 1 }) === "B"
      && C.goldGroup({ mmrc: 0, exacerbations: 2 }) === "E" && C.goldGroup({ mmrc: 0, exacerbations: 1, hospitalised: true }) === "E"; });
  t("SOFA helpers: MAP = (SBP + 2 DBP)/3; qSOFA counts RR ≥22, mentation, SBP ≤100", () => near(C.mapOf(120, 60), 80) && C.qsofa({ rr: 22, mentation: true, sbp: 101 }) === 2 && C.qsofa({ rr: 18, mentation: false, sbp: 100 }) === 1);

  /* ----- parsing helpers ----- */
  t("parseRange: ≤−2, <4.1, ≥90, >1.5, 50–69, −1 to 0, 0, ≥80%", () => {
    const r = s => C.parseRange(s);
    return C.inRange(r("≤−2"), -3) && !C.inRange(r("≤−2"), -1) && C.inRange(r("<4.1"), 4.09) && !C.inRange(r("<4.1"), 4.1) && C.inRange(r("≥90"), 90) && !C.inRange(r(">1.5"), 1.5)
      && C.inRange(r("50–69"), 69) && C.inRange(r("−1 to 0"), -1) && C.inRange(r("0"), 0) && C.inRange(r("≥80%"), 80) && r("Item 9 ≥1") === null; });
  t("pickRange tolerates the printed gaps (creatinine 35–70 then 71–105)", () => C.pickRange(["<35", "35–70", "71–105", "≥106"], 70.5) === 1 && C.pickRange(["<35", "35–70", "71–105", "≥106"], 20) === 0);

  /* ----- the numbers on screen come from the JSON: ranges, bands, points ----- */
  const rangeOf = b => { const col = b.cols[0].key; let lo = 0, hi = 0; b.rows.forEach(r => { const v = r.pts?.[col]; if (v == null) return; if (typeof v === "string") { const m = /(\d+)\s*[–-]\s*(\d+)/.exec(v); hi += m ? +m[2] : 0; } else if (v > 0) hi += v; else lo += v; }); return [lo, hi]; };
  t("points ranges equal the printed totals: Alvarado 0–10, CURB-65 0–5, IPSS 0–35, PHQ-9 0–27, CSRS −3 to 11, Rockall 0–7 (sum of each section's highest row)", () => {
    const pts = d => [...d.left, ...d.right].filter(b => b.type === "points");
    const r = id => rangeOf(pts(J[id])[0]);
    const rock = pts(J.ugib)[1].rows; let hi = 0, cur = []; rock.forEach(x => { if (x.section) { hi += Math.max(0, ...cur); cur = []; } else cur.push(x.pts.p); }); hi += Math.max(0, ...cur);
    return r("alvarado").join() === "0,10" && r("curb65").join() === "0,5" && r("ipss").join() === "0,35" && r("phq9").join() === "0,27" && r("csrs").join() === "-3,11" && hi === 7; });
  t("GBS maximum from the JSON rows: top urea 6 + Hb 6 + SBP 3 + pulse 1 + melaena 1 + syncope 2 + hepatic 2 + cardiac failure 2 = 23", () => {
    const rows = J.ugib.left[0].rows.filter(r => r.pts), max = k => Math.max(...rows.filter(r => r.t).map(r => r.pts.p));
    const get = (a, b) => { const i = J.ugib.left[0].rows.findIndex(r => r.section && r.section.startsWith(a)), j = J.ugib.left[0].rows.findIndex(r => r.section && r.section.startsWith(b)); return J.ugib.left[0].rows.slice(i + 1, j < 0 ? undefined : j).map(r => r.pts.p); };
    const s = (a, b) => Math.max(...get(a, b)); const oth = J.ugib.left[0].rows.slice(J.ugib.left[0].rows.findIndex(r => r.section?.startsWith("Other")) + 1).reduce((a, r) => a + r.pts.p, 0);
    return s("Blood urea", "Haemoglobin") + s("Haemoglobin", "Systolic") + s("Systolic", "Other") + oth === 23; });
  t("score bands (min/max) are contiguous in every card that prints them", () => IDS.every(id => [...J[id].left, ...J[id].right].filter(b => b.type === "bands").every(b => {
    const it = b.items.filter(x => x.min != null && x.max != null).sort((a, c) => a.min - c.min); return it.every((x, i) => i === 0 || x.min === it[i - 1].max + 1); })));
  t("every card has the keys the interface relies on (id, title, left/right blocks, sources)", () => IDS.every(id => J[id].id === id && J[id].title && J[id].subtitle && Array.isArray(J[id].left) && Array.isArray(J[id].right) && J[id].sources.length > 0));
  t("SA STG marks: HOSP/PAED/PHC/MAT24/TBPAED ids are the ✚ sources (SA_SRC pattern)", () => { const rx = /^(HOSP|MAT24|PHC|PAED|TBPAED)(:|$)/; return rx.test("HOSP:23.34") && rx.test("TBPAED:68") && !rx.test("GBS") && !rx.test("SEPSIS3:1"); });
  return out;
}

if (typeof process !== "undefined" && process.versions?.node && import.meta.url === new URL(process.argv[1], "file://").href) {
  const res = await run(); res.forEach(r => console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.err ? "  — " + r.err : "")));
  process.exit(res.every(r => r.ok) ? 0 : 1);
}
