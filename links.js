// Cross-links and search: ONE catalogue of everything in the app (pathways, hubs, procedures, scales, fluids)
// plus "related" lookups. Pure functions over data/index.json and data/related.json, so they can be unit-tested (tests/links.test.mjs).

const TYPE_LABEL = { scale: "Scale", score: "Score", grade: "Grade", calculator: "Calculator", range: "Causes", dose: "Dose" };
// population bucket: "ob" | "both" | "paeds" | "adult" (text before the first "(" or ";" only, later clauses are exclusions)
export const bucket = p => (p = String(p || "").split(/\s*[(;]/, 1)[0], /obstet/i.test(p) ? "ob" : (/adult/i.test(p) && /paed|child/i.test(p)) ? "both"
  : /paed|child|neonat|infant/i.test(p) ? "paeds" : "adult");
// an adult card does not list child-only cards (and the reverse) unless they are the same condition; obstetric and adult mix freely
export const compat = (a, b) => a === b || a === "both" || b === "both" || (a !== "paeds" && b !== "paeds");
// "dka-adult" -> "dka", "fluids-paeds-dka" -> "fluids-dka", "hiv-new-child" -> "hiv-new": same stem = same condition in another population
export const stem = id => id.replace(/(^|-)(adult|paeds|child|neonate|pregnancy)(?=-|$)/, "").replace(/^-/, "");
const clean = s => String(s || "").replace(/_/g, " ");

export function catalog(index, related) {
  const items = [];
  const add = (kind, id, o) => { const it = { key: kind + ":" + id, kind, id, ...o, short: clean(o.short), title: clean(o.title) };
    it.q = [it.short, it.title, id, it.label, o.words || ""].join(" ").toLowerCase(); delete it.words; items.push(it); };
  for (const e of index.diagnoses || []) add("dx", e.id, { short: e.short, title: e.title, pop: bucket(e.tags?.pop || e.population), href: `#/dx/${e.id}/arrival`, label: "Pathway",
    hub: e.hub, parent: e.appendix_to, sys: e.tags?.system || [], cat: e.tags?.cat || [], words: [e.population, ...(e.tags?.system || []), ...(e.tags?.cat || [])].join(" ") });
  for (const h of index.hubs || []) add("hub", h.id, { short: h.short, title: h.title, pop: "both", href: `#/hub/${h.id}`, label: "Pathway", members: h.members.map(m => m.id) });
  for (const e of index.procedures || []) add("proc", e.id, { short: e.short || e.title, title: e.title, pop: bucket(e.population), href: `#/proc/${e.id}/procedure`, label: "Procedure",
    group: e.group, words: [e.population, e.setting].join(" ") });
  for (const g of index.proc_groups || []) add("pgroup", g.id, { short: g.short, title: g.title, pop: bucket(g.population), href: `#/procgroup/${g.id}`, label: "Procedures", members: g.members });
  for (const e of index.scores || []) add("score", e.id, { short: e.short, title: e.title, pop: bucket(e.population), href: `#/score/${e.id}`, label: TYPE_LABEL[e.type] || "Score",
    hidden: !!e.hidden, words: [e.population, e.age_range, e.badge, ...(e.tags || [])].join(" ") });
  for (const e of index.fluids || []) add("fluid", e.id, { short: e.short, title: e.title, pop: bucket(e.pop), href: `#/proc/${e.id}/procedure`, label: "Fluids", words: [e.pop, ...(e.tags || [])].join(" ") });
  if ((index.fluids || []).length) { const h = index.fluids_hub || {}; add("fhub", "fluids", { short: h.short || "Fluids Rx", title: h.title || "IV fluids", pop: "both", href: "#/fluids", label: "Fluids" }); }
  const byKey = {}, byId = {}; for (const it of items) { byKey[it.key] = it; byId[it.id] ||= it; }
  return { items, byKey, byId, topics: (related?.topics || []).map(t => ({ name: t.name, ids: t.ids.filter(id => byId[id]) })) };
}

// The address (#/dx/…) names the item on screen; null on the list pages.
export function keyOf(cat, p) {
  const k = { dx: "dx:", score: "score:", hub: "hub:", procgroup: "pgroup:" }[p[0]];
  if (k) return cat.byKey[k + p[1]] ? k + p[1] : null;
  if (p[0] === "proc") return cat.byKey["fluid:" + p[1]] ? "fluid:" + p[1] : cat.byKey["proc:" + p[1]] ? "proc:" + p[1] : null;
  if (p[0] === "fluids") return cat.byKey["fhub:fluids"] ? "fhub:fluids" : null;
  return null;
}

// Related items, most specific first: appendix parent / children, the same condition in another population, its hub or group, then curated topics.
export function relatedFor(cat, key) {
  const me = cat.byKey[key]; if (!me) return [];
  const out = new Map(), push = (it, why) => { if (it && it.key !== me.key && !out.has(it.key)) out.set(it.key, { ...it, why }); };
  if (me.parent) push(cat.byKey["dx:" + me.parent], "Main pathway");
  if (me.kind === "dx") cat.items.filter(x => x.kind === "dx" && x.parent === me.id).forEach(x => push(x, "Appendix"));
  if (me.hub) push(cat.byKey["hub:" + me.hub], "All sites");
  if (me.group) push(cat.byKey["pgroup:" + me.group], "All cards");
  (me.members || []).forEach(id => push(cat.byId[id], "In this group"));
  const st = stem(me.id);
  if (!me.members) cat.items.filter(x => !x.members && stem(x.id) === st && (x.kind === me.kind || x.pop === me.pop || x.pop === "both" || me.pop === "both")).forEach(x => push(x, x.kind === me.kind ? "Other population" : "Same condition"));
  for (const t of cat.topics) if (t.ids.includes(me.id)) t.ids.forEach(id => { const x = cat.byId[id]; if (x && compat(me.pop, x.pop)) push(x, t.name); });
  return [...out.values()];
}

// Every word must be found; names that start with the query come first, then names that contain it, then description / tag matches.
export function search(cat, q, limit = 40) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  const full = words.join(" ");
  return cat.items.filter(it => words.every(w => it.q.includes(w))).map((it, i) => { const s = it.short.toLowerCase();
    return { it, i, r: s === full ? 0 : s.startsWith(full) ? 1 : words.every(w => s.includes(w)) ? 2 : 3 }; })
    .sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map(x => x.it);
}
