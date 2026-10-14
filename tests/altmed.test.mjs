// Tests for the Alternative Medicine section: feature ranking (altmed.js) and data integrity (data/altmed vs altmed-src).
// Node:  node tests/altmed.test.mjs
import { rank, invert } from "../altmed.js";

async function readJSON(p) {
  const { readFileSync } = await import("node:fs"); return JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
}
async function readCSV(p) { // minimal RFC4180 reader (quoted fields, doubled quotes, newlines inside quotes)
  const { readFileSync } = await import("node:fs"); const s = readFileSync(new URL(p, import.meta.url), "utf8");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...r] = rows; return r.filter(x => x.length === h.length).map(x => Object.fromEntries(h.map((k, i) => [k, x[i]])));
}

export async function run() {
  const d = await readJSON("../data/altmed/index.json"), prose = await readJSON("../data/altmed/prose.json"), out = [];
  const t = (name, fn) => { try { out.push({ name, ok: fn() !== false }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };
  const fi = label => { const i = d.features.findIndex(f => f[1] === label); if (i < 0) throw new Error("no feature " + label); return i; };
  const names = rows => rows.map(r => d.pathogens[r.pi][0]);

  // synthetic mini-index: A has f0,f1; B has f0; C has f1,f2; D has none
  const mini = { pathogens: ["A", "B", "C", "D"].map(n => [n, n === "C" ? "Fungi" : "Bacteria"]), has: { 0: [0, 1], 1: [0, 2], 2: [2] } };
  t("1 nothing selected -> null", () => rank(mini, {}) === null);
  t("2 two 'has': ranked by matches, then name", () => names2(rank(mini, { 0: 1, 1: 1 }).rows) === "A:2,B:1,C:1");
  t("3 strict keeps only entries with every 'has'", () => names2(rank(mini, { 0: 1, 1: 1 }, { strict: true }).rows) === "A:2");
  t("4 'must NOT have' removes entries outright", () => names2(rank(mini, { 0: 1, 2: -1 }).rows) === "A:1,B:1");
  t("5 only NOT selected -> everything else, incl. entries with no features", () => names2(rank(mini, { 2: -1 }).rows) === "A:0,B:0,D:0");
  t("6 kingdom filter", () => names2(rank(mini, { 1: 1 }, { king: "Fungi" }).rows) === "C:1");
  t("7 a feature that is both has and NOT cannot match (NOT wins)", () => names2(rank(mini, { 0: 1, 1: -1 }).rows) === "B:1");
  function names2(rows) { return rows.map(r => mini.pathogens[r.pi][0] + ":" + r.c).join(","); }

  // real data
  t("8 index shape: counts agree with arrays", () => d.counts.pathogens === d.pathogens.length && d.counts.features === d.features.length
    && d.counts.facts === Object.values(d.has).reduce((n, a) => n + a.length, 0));
  t("9 every index in 'has' is a valid pathogen and feature; lists are sorted and unique", () => Object.entries(d.has).every(([f, a]) =>
    +f >= 0 && +f < d.features.length && a.every((p, i) => p >= 0 && p < d.pathogens.length && (i === 0 || p > a[i - 1]))));
  t("10 every pathogen's prose block exists (or it has none)", () => d.pathogens.every(p => !p[3] || prose[p[3]]));
  t("11 feature labels are unique (merged duplicates stay merged)", () => new Set(d.features.map(f => f[1])).size === d.features.length);
  t("12 spelling duplicates are gone, near-matches stay separate", () => {
    const L = new Set(d.features.map(f => f[1]));
    return !L.has("enchephalitis") && L.has("encephalitis") && L.has("ulcer") && L.has("mouth ulcer") && L.has("arthritis") && L.has("septic arthritis"); });
  t("13 invert() agrees with has", () => { const pf = invert(d); return Object.entries(d.has).every(([f, a]) => a.every(p => pf[p].includes(+f))); });
  t("14 fever search is non-empty and every hit really has fever", () => {
    const f = fi("fever"), r = rank(d, { [f]: 1 }); return r.rows.length > 50 && r.rows.every(x => d.has[f].includes(x.pi)); });
  t("15 the header-less all-1s column was not imported as a feature", () => !d.features.some(f => f[1] === ""));
  t("16 the 69 merged species each carry their strains", () => {
    const m = d.pathogens.map((p, i) => [p, i]).filter(([p]) => p[4] === 2); return m.length === 69 && m.every(([, i]) => (d.strains[i] || []).length > 0); });

  // source CSVs and built JSON agree
  const facts = await readCSV("../altmed-src/facts.csv"), pcsv = await readCSV("../altmed-src/pathogens.csv"), fcsv = await readCSV("../altmed-src/features.csv");
  t("17 facts.csv present-rows == index facts, ids resolve", () => {
    const pid = Object.fromEntries(pcsv.map((p, i) => [p.id, i])), fid = Object.fromEntries(fcsv.map((f, i) => [f.id, i]));
    const present = facts.filter(f => f.relation === "present");
    return present.length === d.counts.facts && present.every(f => d.has[fid[f.feature_id]]?.includes(pid[f.pathogen_id])); });
  t("18 pathogen and feature order match the CSV", () => pcsv.every((p, i) => d.pathogens[i][0] === p.name) && fcsv.every((f, i) => d.features[i][1] === f.label));
  return out;
}
if (typeof process !== "undefined" && process.versions?.node && import.meta.url === new URL(process.argv[1], "file://").href) {
  const res = await run(); res.forEach(r => console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.err ? "  — " + r.err : "")));
  process.exit(res.every(r => r.ok) ? 0 : 1);
}
