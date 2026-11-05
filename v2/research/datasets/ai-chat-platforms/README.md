# AI chat & companion platforms — category dataset

Descriptive facts and evidence for every platform with a merged scope decision
of **in/borderline** in the `2026-10-27-ai-companions` research run. Built
**2026-11-04**. This is a **reusable category dataset for any article in the AI
chat/companion category** — it is deliberately *not* a ranking: research files
are discovery/leads only, evidence never sets rank, aggregator facts never
override first-party facts, and affiliate status is a site-level concern that
does not appear here.

## Files

| file | contents |
|---|---|
| `platforms.csv` | one row per in/borderline platform, flat columns |
| `platforms.json` | same rows as array `platforms`, plus full per-flag source detail and build metadata; empty values are `null`, counts are integers, `true/false` are booleans |
| `build-dataset.py` | rebuilds both files from the run's `merged/` outputs; idempotent (reruns are byte-identical; no values are invented or filled in) |

## Rebuild

```
python v2/research/datasets/ai-chat-platforms/build-dataset.py
```

Pipeline order that produces the inputs: `scope-pass.py` → `scope-resolve.py` →
`merged/redflags-ingest.py` (`merged/` = `v2/research/runs/2026-10-27-ai-companions/merged/`).
The dataset reads `merged/scoped.csv` (universe + merged fields + confidence)
and `merged/redflags.csv` (per-model answers, red-flag union with source-level
detail, file provenance). A rebuild without upstream changes is byte-identical;
gaps (empty fields) mean "no evidence found" and are never guessed.

## Columns (`platforms.csv`)

| column | meaning |
|---|---|
| `slug` | canonical id (unicode-preserving slug of the canonical name) |
| `name` | canonical display name |
| `domain` | primary web domain from the census (store-built apps may load a store wrapper; check `scope_pending`) |
| `category` | scope category (`hosted_character_hubs`, `dedicated_virtual_companions`, `interactive_story_engines`, …) |
| `usage_band` | usage-signal band A/B/C from the usage pass, or `D`/`U` fallback bands |
| `supply_runs` | number of independent census runs that assessed this platform |
| `community_users` | distinct community users observed in census evidence, summed across evidence tiers A+B (each tier is a tier max; a user seen in both tiers counts twice — a lower-bound community signal, not popularity; blank = none recorded) |
| `scope_decision` | `in` or `borderline` (out rows are excluded) |
| `scope_pending` | `true` if the row is one of the unresolved borderline cases |
| `nsfw_answer` | merged NSFW permission: `yes` / `no` / `unresolved` / `conflict` |
| `nsfw_decided_by` | which research source(s) hold the deciding answer (e.g. `gemini+pplx_scope`, or `conflict`) |
| `nsfw_verbatim` | `true` when at least one resolving source quotes platform text verbatim |
| `evidence_strength` | `paraphrase` when the only `yes` evidence is a non-verbatim marketing paraphrase |
| `chat_answer` | merged chat-without-image-credits answer, same vocabulary |
| `chat_decided_by` | as above for the chat field |
| `coverage` | `researched` when at least one red flag (of any status) was reported by any model; otherwise `not_researched` — **never `clean`** |
| `confidence` | `high` / `medium` / `low` (definitions below) |
| `flag_types` | pipe-joined red-flag types (union across research models, deduped by type) |
| `flag_count` / `recurring_count` / `isolated_count` | merged flag totals; `recurring` = 2+ recounted independent users, otherwise `isolated` |
| `downgraded_count` | flags whose "recurring" claim from a model failed the recount and was downgraded (audit trail; detail in `platforms.json`) |
| `white_label_family` | clone/white-label family reported by any model (unaudited label, leads only) |
| `deep_files` | deep-pass file(s) a record came from (empty = no deep-pass source) |
| `sources` | distinct evidence URLs (NSFW/chat answer sources + red-flag sources) |
| `accessed_dates` | distinct dates the research accessed the red-flag sources (`date_shown` per source lives in `platforms.json` flag details) |

## Evidence rules

- **Merged fields**: several research models answer each field first-party
  (ToS/content policy/pricing/product pages). A resolved `yes`/`no` beats
  `unresolved`; when resolved answers disagree, the merged value is `conflict`
  and all answers stay side by side — never silently collapsed. `decided_by`
  logs which source(s) decided (or that it is a conflict).
- **Verbatim vs paraphrase**: platform wording quoted verbatim is labeled;
  a `yes` resting only on non-verbatim marketing paraphrase is marked
  `evidence_strength=paraphrase` and can never reach `high` confidence.
- **Red flags**: union across models, deduped by type. `independent_users` is
  recounted conservatively after the union: named handles plus one user per
  distinct `independent_user` URL (a thread page with several complainers
  counts as ONE unit until named-handle evidence exists). Affiliate/review-site
  domains never count as users (synonymsvault, aifreands, aigirlfriendbase,
  funfun, tryclout, companaya, spicyranked). `recurring` requires 2+ users;
  model claims that recount lower are downgraded to `isolated` and logged in
  the flag's `downgraded_claims` (see `platforms.json`).
- **Not researched ≠ clean**: zero flags from every model is
  `coverage=not_researched` (and `confidence=low`), never a clean bill of health.
- **Deep-pass provenance**: the deep pass was stopped after its batch-1 test on
  `redflags-deep-prompt-1.txt` (kept, with its outputs, as the test record).
  Records from that test keep their file name in `deep_files`;
  `redflags-deep-gemini-1.json` covered the wrong platforms and was never ingested.
- **Executed first-party checks**: `nsfw_decided_by`/`chat_decided_by` may cite
  `pplx_scope` — the decomposed first-party test answers executed during scope
  resolution (census-scope-checks Test A records).
- **No guessing**: empty = nothing found. Relative dates are shown as the
  source displayed them; conflicting reports stay side by side.

## Confidence

- **high** — merged NSFW answer `yes`/`no` with at least one **verbatim**
  first-party source AND red flags researched (`coverage=researched`).
- **medium** — resolved NSFW answer (including paraphrase-only `yes`) **or**
  flags researched while NSFW stays `unresolved`.
- **low** — NSFW `unresolved` or `conflict`, or `coverage=not_researched`.

`scope_pending=true` and `chat/conflict` fields lower trust further; treat the
`chat` field the same way when an article relies on chat-without-image-credits
behavior, and re-verify anything used as a claim against the cited source.
