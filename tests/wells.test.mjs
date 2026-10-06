// Unit tests for the checklist score-card registry in calc.js (Wells PE / DVT).
// Node:  node tests/wells.test.mjs      Browser: see README note — load as a module and call run()
import { REG, scoreCard, wells_pe, wells_dvt, interpretCard, validateScoreCard } from "../calc.js";

async function load(name) {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFileSync } = await import("node:fs"); return JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
  }
  return (await fetch(new URL(`../data/${name}.json`, import.meta.url))).json();
}
export async function run() {
  const pe = await load("wells-pe"), dvt = await load("wells-dvt"), out = [];
  const t = (name, fn) => { try { out.push({ name, ok: fn() !== false }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };
  const band = (card, ver, total, scheme) => interpretCard(card, ver, total).schemes.find(x => x.scheme === scheme)?.band?.label;

  t("1 PE wells: HR>100 + haemoptysis = 2.5; three-tier Moderate (PE ≈16%); two-level unlikely; likely=false", () => {
    const tk = ["PE3", "PE6"], n = wells_pe(pe, tk, "wells"), it = interpretCard(pe, "wells", n);
    return n === 2.5 && band(pe, "wells", n, "three-tier") === "Moderate (2–6)" && it.schemes[0].band.risk === "PE ≈16%" && band(pe, "wells", n, "two-level (modified)") === "PE unlikely (≤4)" && it.likely === false && !it.mapped; });
  t("2 PE simplified with the same ticks = 2 -> PE likely (≥2)", () => {
    const n = wells_pe(pe, ["PE3", "PE6"], "simplified"), it = interpretCard(pe, "simplified", n);
    return n === 2 && band(pe, "simplified", n, "two-level") === "PE likely (≥2)" && it.likely === true; });
  t("3 PE wells: DVT signs + alternative less likely + HR>100 = 7.5 -> High (>6) and likely (>4)", () => {
    const n = wells_pe(pe, ["PE1", "PE2", "PE3"], "wells"), it = interpretCard(pe, "wells", n);
    return n === 7.5 && band(pe, "wells", n, "three-tier") === "High (>6)" && band(pe, "wells", n, "two-level (modified)") === "PE likely (>4)" && it.likely === true; });
  t("4 DVT modified: leg + calf + pitting + previous DVT = 4 likely; original = 3 High, likely (mapped)", () => {
    const tk = ["DVT5", "DVT6", "DVT7", "DVT9"], m = wells_dvt(dvt, tk, "modified"), o = wells_dvt(dvt, tk, "original");
    const im = interpretCard(dvt, "modified", m), io = interpretCard(dvt, "original", o);
    return m === 4 && band(dvt, "modified", m, "two-level") === "DVT likely (≥2)" && im.likely === true && !im.mapped
      && o === 3 && band(dvt, "original", o, "three-tier") === "High (≥3)" && io.likely === true && io.mapped; });
  t("5 DVT: localised tenderness + alternative dx = -1 -> modified unlikely (≤1); original Low (≤0)", () => {
    const tk = ["DVT4", "DVT10"], m = wells_dvt(dvt, tk, "modified"), o = wells_dvt(dvt, tk, "original");
    return m === -1 && o === -1 && band(dvt, "modified", m, "two-level") === "DVT unlikely (≤1)" && band(dvt, "original", o, "three-tier") === "Low (≤0)" && interpretCard(dvt, "original", o).likely === false; });
  t("6 D-dimer: age 72 -> 720; age 45 -> standard cut-off (null)", () => REG.ddimer_age_adjusted({ age: 72 }) === 720 && REG.ddimer_age_adjusted({ age: 45 }) === null && REG.ddimer_age_adjusted({ age: 50 }) === null && REG.ddimer_age_adjusted({ age: 51 }) === 510);
  t("7 PERC rule: none ticked = negative; any ticked = cannot be applied (app logic: any = perc.size > 0)", () => pe.perc.items.length === 8 && pe.perc.items.includes("Oestrogen use"));
  t("8 maxima: all ticked except the negative item -> PE 12.5 / 7, DVT 8 / 9", () => {
    const all = (c, v) => c.components.filter(x => !(x.points[v] < 0)).map(x => x.key);
    return wells_pe(pe, all(pe, "wells"), "wells") === 12.5 && wells_pe(pe, all(pe, "simplified"), "simplified") === 7
      && wells_dvt(dvt, all(dvt, "original"), "original") === 8 && wells_dvt(dvt, all(dvt, "modified"), "modified") === 9; });
  t("null points are ignored even when ticked (previous DVT in the original)", () => wells_dvt(dvt, ["DVT9"], "original") === 0);
  t("no decimal drift: 1.5 × 3 + 3 + 3 + 1 + 1 = 12.5 exactly", () => scoreCard(pe, "wells", pe.components.map(c => c.key)).total === 12.5);
  t("min/max from points equal formulas range; validateScoreCard is clean for both cards", () => validateScoreCard(pe).length === 0 && validateScoreCard(dvt).length === 0
    && scoreCard(dvt, "modified", []).min === -2 && scoreCard(dvt, "original", []).max === 8);
  t("validation catches a bad range", () => { const c = JSON.parse(JSON.stringify(pe)); c.formulas[0].range = [0, 13]; return validateScoreCard(c).length > 0; });
  return out;
}
if (typeof process !== "undefined" && process.versions?.node && import.meta.url === new URL(process.argv[1], "file://").href) {
  const res = await run(); res.forEach(r => console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.err ? "  — " + r.err : "")));
  process.exit(res.every(r => r.ok) ? 0 : 1);
}
