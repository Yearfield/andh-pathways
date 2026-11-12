// Unit tests for links.js: the catalogue, cross-links ("Related") and search-everything.
// Node:  node tests/links.test.mjs
import { readFileSync } from "node:fs";
import { catalog, keyOf, relatedFor, search, stem, compat } from "../links.js";
const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const index = load("index"), related = load("related"), cat = catalog(index, related), out = [];
const t = (name, fn) => { try { const r = fn(); out.push({ name, ok: r !== false, err: r === false ? "returned false" : "" }); } catch (e) { out.push({ name, ok: false, err: e.message }); } };
const rel = id => relatedFor(cat, cat.byId[id].key).map(x => x.id);

t("1 every id in related.json exists in index.json", () => { const bad = related.topics.flatMap(tp => tp.ids.filter(id => !cat.byId[id]).map(id => tp.name + ": " + id)); if (bad.length) throw new Error(bad.join("; ")); });
t("2 ids are unique across pathways, hubs, procedures, scales and fluids", () => { const seen = {}, dup = cat.items.filter(i => (seen[i.id] = (seen[i.id] || 0) + 1) > 1).map(i => i.id); if (dup.length) throw new Error(dup.join(", ")); });
t("3 stem drops the population part", () => stem("dka-adult") === "dka" && stem("fluids-paeds-dka") === "fluids-dka" && stem("hiv-new-child") === "hiv-new" && stem("hypo-pregnancy") === "hypo" && stem("sam") === "sam");
t("4 adult and paediatric never mix; obstetric mixes with adult; 'both' mixes with all", () => !compat("adult", "paeds") && compat("adult", "ob") && compat("both", "paeds") && !compat("ob", "paeds"));
t("5 DKA adult links its child twin, adult fluids and the blood gas card, but not child fluids", () => { const r = rel("dka-adult");
  return r[0] === "dka-paeds" && r.includes("fluids-adult-dka") && r.includes("bloodgas-interpretation") && r.includes("lytes-adult-hypok") && !r.includes("fluids-paeds-dka") && !r.includes("dka-adult"); });
t("6 links run both ways", () => rel("fluids-adult-dka").includes("dka-adult") && rel("curb65").includes("lrti-adult") && rel("lrti-adult").includes("curb65"));
t("7 appendix pathways link to their parent and back", () => rel("opioids-withdrawal")[0] === "opioids" && rel("opioids").includes("opioids-withdrawal"));
t("8 hub and group members link to their hub / group", () => rel("fracture-adult").includes("fracture") && rel("fracture").includes("fracture-paeds") && rel("lytes-adult-hyperk").includes("lytes-adult"));
t("9 the UGIB score card pairs with the adult pathway only", () => rel("ugib").includes("ugib-adult") && !rel("ugib").includes("ugib-paeds") && rel("ugib-adult").includes("ugib"));
t("10 every pathway, procedure, scale and fluid card has at least one related card", () => { const none = cat.items.filter(i => !relatedFor(cat, i.key).length).map(i => i.id); if (none.length) throw new Error(none.join(", ")); });
t("11 search: name matches first, tags found, every word required", () => { const a = search(cat, "dka").map(x => x.id), b = search(cat, "potassium").map(x => x.id);
  return a[0].startsWith("dka-") && a.includes("fluids-adult-dka") && b.includes("bloodgas-interpretation") && search(cat, "dka zzz").length === 0 && search(cat, "  ").length === 0; });
t("12 keyOf reads the address", () => keyOf(cat, ["dx", "sam", "days"]) === "dx:sam" && keyOf(cat, ["proc", "fluids-neonate"]) === "fluid:fluids-neonate" && keyOf(cat, ["proc", "rsi-adult"]) === "proc:rsi-adult" && keyOf(cat, ["diagnoses"]) === null && keyOf(cat, ["dx", "nope"]) === null);

for (const r of out) console.log((r.ok ? "ok   " : "FAIL ") + r.name + (r.ok ? "" : " — " + r.err));
if (out.some(r => !r.ok)) process.exit(1);
