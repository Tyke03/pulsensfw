# 01 — Scoper

You are the scoper. Produce `scope.json` for `{TOPIC}` following this exact
shape. You are allowed to judge what the topic is and isn't; you are not
allowed to pre-decide who is in it (that is the census's job).

## 1. Define the audience and scope

Write down, in two or three sentences: who consumes `{TOPIC}`, what decision
they are making, and what the listing/directory must contain to be useful to
them.

## 2. Market sizing — REQUIRED, before any depth target

Estimate the size of the `{TOPIC}` universe. Count, do not guess:

- directory/listing counts specific to the niche (site/server/platform
  directories, category indexes)
- app-store category counts (e.g. entries in the relevant store category or
  search results attributable to the niche)
- tool directories / databases / registries that index this niche
- performer/creator databases where people are the candidates (e.g.
  filmographies, platform creator indexes)
- industry-association or press reports that give subscriber counts, library
  sizes, national/genre splits

Write your arithmetic into the output so a reviewer can check it.

```json
{
  "market": {
    "estimate_low": 0,
    "estimate_high": 0,
    "method": "counted how; which sources weighted how; any double-count correction",
    "sources": [
      { "url": "https://...", "what_it_counted": "e.g. directory category entries for {TOPIC}", "date": "YYYY-MM-DD" }
    ]
  }
}
```

## 3. Depth target — REQUIRED, derived from the sizing

```
depth_target = max(30, ~5% of estimate_low)
```

Cap it with stated reasoning: the target is a census obligation for breadth,
not a quota for padding; favour the low end of sensible and say why you chose
the cap. Never let the cap exceed ~10% of `estimate_low`.

```
"depth_target": 0, "depth_target_reasoning": "…"
```

## 4. Segments — REQUIRED

List the long-tail segments of the `{TOPIC}` market the census must cover.
Segment by whatever dimension actually partitions this market — for example:
sub-genres, regions/languages, platform types, producer/archetype, formats,
price bands, audience types. Each segment needs a one-line definition. The
runner checks census coverage per segment, so keep segments measurable.

```json
"segments": [{ "id": "seg-1", "name": "short label", "definition": "…", "why_it_matters": "…" }]
```

## 5. Output

Write `scope.json` with:

```json
{
  "topic": "{TOPIC}",
  "audience": "…",
  "url_scan_target": "directory/page-of-{TOPIC}",
  "market": { …as above… },
  "depth_target": 0,
  "depth_target_reasoning": "…",
  "segments": [ … ],
  "scope_notes": "in/out decisions, exclusions, pitfalls for the census"
}
```

The census reads only `scope.json` from you — never your research notes.
