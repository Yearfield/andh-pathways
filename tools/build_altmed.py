#!/usr/bin/env python3
"""altmed-src/*.csv  ->  data/altmed/index.json + data/altmed/prose.json

    python3 -I tools/build_altmed.py            (run from the repo root)

index.json  small: features, pathogen list, and an inverted feature -> pathogens index (what the Find filter needs).
prose.json  loaded when a pathogen card is first opened. Identical text (many strains of one species share it) is stored once.

Only positive facts are stored ("present"). A feature that is not listed for a pathogen is treated as "no" by the app.
relation "absent" / "unknown" rows are accepted for future review work but are not used yet (counted in the printout).
"""
import csv, json, hashlib, os, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, "altmed-src"), os.path.join(ROOT, "data", "altmed")
STATUS = {"imported": 0, "sourced": 0, "verified": 1, "disputed": 2}
SRCCODE = {"formula": 0, "matrix": 1, "matrix+formula": 2}


def rd(name):
    with open(os.path.join(SRC, name), encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def die(msg):
    sys.exit("build_altmed: " + msg)


features, pathogens, facts, prose, strains = rd("features.csv"), rd("pathogens.csv"), rd("facts.csv"), rd("prose.csv"), rd("strains.csv")
fidx = {f["id"]: i for i, f in enumerate(features)}
pidx = {p["id"]: i for i, p in enumerate(pathogens)}
if len(fidx) != len(features):
    die("duplicate feature id")
if len(pidx) != len(pathogens):
    die("duplicate pathogen id")
if len({f["label"] for f in features}) != len(features):
    die("duplicate feature label")

rank = {0: 0, 1: 1, 2: 2}
pstat = collections.defaultdict(lambda: [0, 0, 0])  # per pathogen: counts of imported / verified / disputed rows
inv = collections.defaultdict(set)
skipped = collections.Counter()
for r in facts:
    if r["pathogen_id"] not in pidx:
        die("facts.csv: unknown pathogen " + r["pathogen_id"])
    if r["feature_id"] not in fidx:
        die("facts.csv: unknown feature " + r["feature_id"])
    if r["review_status"] not in STATUS:
        die("facts.csv: bad review_status " + r["review_status"])
    pstat[r["pathogen_id"]][STATUS[r["review_status"]]] += 1
    if r["relation"] == "present":
        inv[fidx[r["feature_id"]]].add(pidx[r["pathogen_id"]])
    elif r["relation"] in ("absent", "unknown"):
        skipped[r["relation"]] += 1
    else:
        die("facts.csv: bad relation " + r["relation"])

blocks, bref = {}, {}
byp = collections.defaultdict(dict)
for r in prose:
    if r["pathogen_id"] not in pidx:
        die("prose.csv: unknown pathogen " + r["pathogen_id"])
    if r["review_status"] not in STATUS:
        die("prose.csv: bad review_status " + r["review_status"])
    byp[r["pathogen_id"]][r["field"]] = r["text"]
    pstat[r["pathogen_id"]][STATUS[r["review_status"]]] += 1
for pid, d in byp.items():
    s = json.dumps(d, sort_keys=True, ensure_ascii=False)
    h = hashlib.md5(s.encode()).hexdigest()[:8]
    if blocks.get(h, d) != d:
        die("hash collision " + h)
    blocks[h] = d
    bref[pid] = h


def status(pid):
    imp, ver, dis = pstat[pid]
    return 2 if dis else 1 if ver and not imp else 0


sdict = collections.defaultdict(list)
for r in strains:
    if r["pathogen_id"] not in pidx:
        die("strains.csv: unknown pathogen " + r["pathogen_id"])
    sdict[pidx[r["pathogen_id"]]].append([r["full_name"], r["ncbi_taxid"]])

index = {
    "v": 1,
    "counts": {"pathogens": len(pathogens), "features": len(features), "facts": sum(len(v) for v in inv.values())},
    "features": [[f["id"], f["label"], f["group"], f["type"]] for f in features],
    "pathogens": [[p["name"], p["kingdom"], p["ncbi_taxid"], bref.get(p["id"], ""), SRCCODE[p["source_sheet"]], status(p["id"]), p["full_name"]]
                  for p in pathogens],
    "has": {str(k): sorted(v) for k, v in sorted(inv.items())},
    "strains": {str(k): v for k, v in sorted(sdict.items())},
}
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(OUT, "prose.json"), "w", encoding="utf-8") as f:
    json.dump(dict(sorted(blocks.items())), f, ensure_ascii=False, separators=(",", ":"))
kb = lambda n: round(os.path.getsize(os.path.join(OUT, n)) / 1024)
print(f"index.json {kb('index.json')} KB, prose.json {kb('prose.json')} KB; {index['counts']}; "
      f"{len(blocks)} unique prose blocks; skipped {dict(skipped) or 'none'}")
