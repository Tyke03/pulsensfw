# 01b — Baseline (listicle collection)

You are the baseline agent. You run **once**, **in parallel with** or after the
census starts, and you are a model that does **not** run the census, the ranker,
or anything downstream except this file. Your output is used only for coverage
metrics; it is never shown to the census agents, and never shapes the ranking.

## Task

Collect the names appearing on the top ~10 Google-ranking listicle/aggregator
pages for `{TOPIC}` — the content that a plain web search would surface first.

## Procedure

1. Take the top ~10 Google results for the obvious `{TOPIC}` listicle queries
   (e.g. "best {TOPIC}", "{TOPIC} sites", "top {TOPIC} 2026"). Prefer pages that
   rank in the top 3 slots across 2–3 query variants.
2. From each, extract the listed names exactly as they appear (plus a
   normalised variant for directory/registry matching).
3. Record for each source: URL, its rank on Google, the list length, and for
   each name its position in the list.

## Output — `baseline.json`

```json
{
  "topic": "{TOPIC}",
  "collected": "YYYY-MM-DD",
  "sources": [
    { "url": "https://…", "google_position": 1, "list_length": 25, "type": "listicle|aggregator|directory|forum-thread" }
  ],
  "names": [
    { "name": "As Printed", "normalised": "slug-id", "sources": ["url", "url"], "list_positions": [1, 4] }
  ]
}
```

## Standing rules

- This is a mirror of mainstream SEO content, not an endorsement. Mark nothing
  by quality; the census may reject these names and that is expected and fine.
- Do not visit sites beyond the top ~10 Google results; no deep research, no
  fact-checking, no verification. Your job is one pass of the "obvious" layer.
- Do not pass this file to 02-census agents. Stage 02b is the only consumer.
