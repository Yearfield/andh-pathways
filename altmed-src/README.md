# Alternative Medicine — source branch (not published)

This branch is NOT used for GitHub Pages. It holds what is needed to edit and rebuild the Alternative Medicine data;
the app branch deliberately leaves these files out so they are not served on the site.

- `altmed-src/*.csv` — source of truth (pathogens, features, facts, prose, strains). Edit these; set `review_status` to
  `verified` / `disputed`. `review/` lists duplicates, including the near-matches kept separate on purpose.
- `tools/build_altmed.py` — compiles the CSVs into `data/altmed/index.json` + `prose.json` (run from the repo root: `python3 -I tools/build_altmed.py`).
- `tools/xlsx_to_altmed_csv.py` — the one-off import from the workbook. Do not re-run it over reviewed CSVs (ids are regenerated).
- `tests/altmed.test.mjs` — `node tests/altmed.test.mjs` checks ranking and that the built JSON matches the CSVs.

## Workflow
1. Edit the CSVs on this branch, rebuild, run the test, commit.
2. Copy ONLY `data/altmed/index.json` and `data/altmed/prose.json` to the app branch (the one served by Pages) and commit them there.
   Data files refresh on phones automatically; no `sw.js` version bump is needed for data-only changes.
