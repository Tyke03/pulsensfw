# PulseNSFW research pipeline — method templates

Every topic's research cycle runs the same pipeline in this order. Templates are
topic-agnostic: they use `{TOPIC}` placeholders and must never embed candidate
names, preferences, or examples from any prior run.

```
00 (this file)      pipeline contract
01-scoper.md        define {TOPIC}, market sizing, depth_target, segments -> scope.json
01b-baseline.md     baseline listicle/aggregator names, by a model that does NOT census -> baseline.json
02-census.md        exhaustive candidate census (two independent runs: census A, census B) -> search_log.json + candidates_all.json
02b-coverage-gate.md coverage audit by GLM -> coverage.json (PASS/FAIL; ranking waits for PASS)
03-rank.md          editorial ranking of census candidates -> ranking.json
04-write.md         article + entity updates via the submission pipeline
```

Non-negotiable rules (read with every stage):

- **Research files are discovery/leads only.** Any number sourced from a
  listicle/affiliate blog is `evidence_type: aggregator` and never sets a rank
  or overrides a first-party value.
- **Never assert an unverified number.** Unverified = null + note; conflicting
  reports stay null with a "conflicting reports" note.
- Fact provenance everywhere: `{ key, value, source_url, checked,
  evidence_type, notes }` with evidence_type `first_party | community |
  hands_on | press | aggregator`.
- An "avoid"/dealbreaker verdict requires first-party confirmation (ToS,
  billing/settings page, privacy policy, official statement) OR 2+ independent
  dated community sources. One anonymous list does not make an avoid.
- Affiliate status (`active`/`needs_search`/`program_found_signup_queued`/
  `no_program`) never affects score or rank. Only `active` links render as
  affiliate links.
- The census (02) never sees 01b's output. The census runs **twice** (census A
  and census B, different models) so overlap can be measured. 02b is computed
  by GLM, never by a census model. Stage 01 and stage 03 may be any capable
  model; 01b, 02, 02b must be three different models.
- Anything unverifiable is `null` in records, never a placeholder number.

Output contracts for 01–04 are stated in each file. The submission pipeline
(`npm run ingest` + `v2/src/schemas/submission.json`) is the only route from
research outputs into the site.
