# 02b — Coverage gate (run by GLM; not by a census model)

You are the coverage auditor. Compute a machine-checkable **PASS/FAIL** audit
from the scope, census, and baseline outputs. You did not produce any census
and you must not infer candidates — only audit the files. Ranking starts only
after you write PASS; when FAIL, the censuses rerun with your listed gaps as
**new search angles, never as candidate names**.

Inputs:

- `scope.json` (01) — market sizing, `depth_target`, `segments`
- Census A and Census B, each with `search_log.json` + `candidates_all.json` (02)
- `baseline.json` (01b) — listicle/aggregator names for coverage metrics only
- slug matching is done by DOI-free normalised slug (census provides it) or
  fuzzy name equality (census outputs carry it); document in `matched-by` every
  merged pair

## Compute

### 1. Depth per census

For each census:

- kept candidates = `status: kept` count
- counted vs `scope.json.depth_target` (yes/no)
- saturation reached? Audit from `search_log.json`, not from census claims:
  last 6+ angles round yielded <10% new candidates?

### 2. Census overlap and population estimate

- Overlap = normalised slugs in BOTH kept sets
- Capture-recapture estimate: `N ≈ n1 × n2 / overlap` (n1 = census A kept,
  n2 = census B kept). Zero overlap means the estimate is undefined — report
  "overlap too low to estimate" instead of a number.
- Compare `N` against `scope.json.market.estimate_low / estimate_high`:
  inside / below / above, with a one-line note. Below the market range is a
  coverage miss — flag it; do not silently accept it.

### 3. Novelty vs baseline

Two novelty figures, per census:

- `novel_vs_baseline_pct` = 100 × (kept candidates not matching any
  `baseline.json` name) / kept
- `baseline_only_pct` = 100 × (baseline names absent from that census) /
  census kept — how much of the census footprint the mainstream baseline
  did NOT have; grows with censori-led mass, not quality.

### 4. Segment coverage

`candidates per segment` for both censuses, and for the union. A segment is
"met" if ≥1 kept candidate in the union; per-census zero is reported even when
the union covers it.

## Output: `coverage.json`

```json
{
  "topic": "{TOPIC}",
  "audited": "YYYY-MM-DD",
  "depth": { "census_a": { "kept": 0, "target_met": true }, "census_b": { … } },
  "saturation": { "census_a": { "reached": true, "evidence": "round 6: 17 opened, 1 new (5.9%)" }, "census_b": { … } },
  "overlap": { "count": 0, "capture_recapture_N": 0, "vs_market": "inside|below|above" },
  "novelty": { "census_a": { "novel_vs_baseline_pct": 0, "baseline_only_pct": 0 }, "census_b": { … } },
  "segments": [ { "segment": "seg-1", "census_a": 0, "census_b": 0, "union": 0, "met": true } ],
  "verdict": "PASS | FAIL",
  "fail_gaps": [ "depth_target_missed:census_a", "novelty_lt_40_pct:census_b", "segment_zero:seg-2" ],
  "next_angles": [ "…new search angles, never candidate names…", "…" ],
  "notes": "…one-line audit remarks…"
}
```

## FAIL conditions (place in `fail_gaps` verbatim)

- depth target missed, any census: `depth_target_missed:census_X`
- saturation not reached, any census: `saturation_not_reached:census_X`
- novelty < 40%: `novelty_lt_40_pct:census_X`
- any segment with zero candidates in the union: `segment_zero:<seg-id>`

On FAIL, 02-census reruns as a **supplementary round** using only
`next_angles`. Prohibitions hold: gaps are formulated as search angles
(segment-name, directory-name, region-name), never as candidate names.
Ranking may not start until `coverage.json.verdict == "PASS"`.

## Notes

- Never modify the census files — fixes go to the census agents on rerun.
- The auditor model must be a THIRD model, distinct from the census models.
- If `baseline.json` is missing, novelty figures are "unavailable — baseline
  step skipped" and coverage base is PASS-eligible with a plan to backfill.
