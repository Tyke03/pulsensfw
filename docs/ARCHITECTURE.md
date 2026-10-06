# PulseNSFW — Agent Fleet & Orchestrator Transition: Architecture and Migration Design

Status: **Design v1 (shadow-mode implementation)** · Branch: `feat/agent-fleet-orchestrator` · 2026-09-25
Owner: Brent (all production-impacting actions require his explicit approval)

---

## How the system works, in plain language

**One sentence:** a Node app on Render that creates content using Pollinations' AI —
it always tries the free model first, only pays for smarter models when the free one
keeps failing, and a ledger in Neon Postgres makes sure it can never spend more than
the configured daily cap (`POLLINATIONS_DAILY_BUDGET_USD`, default $2).

```
Render cron "pulsensfw-tick" (periodic heartbeat)
        │
        ▼
Orchestrator (inside web app)  ── picks jobs from the work queue in Neon
        │
        ▼
THE LADDER (model-ladder.ts + invoker.ts)
  1. FREE Pollinations "openai-fast"            ← every job starts here ($0, no key)
  2. failed N×? → PAID tier1 "openai/gpt-6-luna"  ← sk_ key, gen.pollinations.ai
  3. tier1 failed 3× more? → PAID tier2 "openai/gpt-6-sol"  ← ceiling
  4. still failing / retries exhausted? → held for human review
        │
        ▼
BUDGET LEDGER (budget-ledger.ts → paid_budget_* tables in Neon)
  • before any paid call: reserve the estimated cost in Postgres
    (ledger down? → paid refused, stays free — never spends blind)
  • after the call: record the real cost, release the unused reservation
  • cap hit → everything falls back to free until the next UTC day
        │
        ▼
RESULTS → posts/content written to Neon → published by the site
```

Where everything lives: code on GitHub (`Tyke03/pulsensfw`, `main` auto-deploys to
Render), app + cron on Render, database on Neon Postgres, AI exclusively on
Pollinations (OpenRouter was removed entirely in the Pollinations-only correction).
Operator surfaces: `/health` (public heartbeat), `/api/orchestrator/status` (admin
token — ladder state, budget, pool health), `/api/orchestrator/spend-report` (admin
token — paid spend per role/tier, 7-day trend, monthly projection). Every run is
logged in `agent_runs` (tier, model, cost, pass/fail).

Escalation rules that keep costs sane:

- The attempt counter **resets on every successful stage** — a role that once needed
  paid help drops back to free as soon as it succeeds again.
- Paid escalation is **capped by the item's retry budget** (`max_attempts`): once a
  work item has exhausted its attempts it is headed to human review, so it never pays.
- Report-only stages (health checks, audits) **terminalize their work item** on
  completion — a succeeded item can never be re-claimed forever.

---

## 0. Executive summary

This document is the implementation contract for replacing PulseNSFW's independent
cron-fleet content pipeline (14 scheduled Pollinations-style agents + a persona auditor
fleet) with:

- **15+1 versioned, stateless prompt-agent packages** (one per legacy role, plus a
  `visual-director`), each a pure function: JSON work packet in → schema-valid JSON out.
- **One code-based orchestrator** — the sole scheduler, state-transition authority,
  retry manager, policy enforcer, and executor of production side effects.
- **Neon Postgres** as the canonical operational store, extended minimally via
  additive, reversible migrations.
- **Shadow mode**: the new pipeline produces proposals, briefs, plans, scorecards and a
  full run ledger **without any production side effect**, for evaluation before cutover.

Conflicts between supplied material and this instruction were resolved by the smallest
safe change and are logged in §14.

---

## 1. Legacy cron → prompt-agent mapping

Legacy sources: `user_supplied/PIPELINE_STATE.md`, `user_supplied/pipeline/baselines/*.md`,
`user_supplied/pipeline/step0-role-map.json`. All legacy cron task texts contained inline
bearer tokens and hardcoded affiliate registries; both are eliminated in the target design
(tokens live in env vars; affiliate resolution is runtime-only from Neon).

| # | Legacy cron (ID) | Schedule (UTC) | New agent ID | Purpose | Trigger | Side effects | Human escalation |
|---|---|---|---|---|---|---|---|
| 1 | research-ai-chatbots (`e61e0ab3`) | `33 1,5,9,13,17 * * *` | `research-ai-chatbots` | Candidate discovery for ai-chatbots | orchestrator tick | none (proposals only) | insufficient evidence |
| 2 | research-sex-tech (`cc8fe35c`) | `47 1,5,9,13,17 * * *` | `research-sex-tech` | Candidate discovery for sex-tech | tick | none | insufficient evidence |
| 3 | research-vr (`3e3b9902`) | `28 1,5,9,13,17 * * *` | `research-vr` | Candidate discovery for vr | tick | none | insufficient evidence |
| 4 | research-industry-news (`505d1f34`) | `46 1,5,9,13,17 * * *` | `research-industry-news` | Candidate discovery incl. mandatory `news_fit` | tick | none | sensitive-content risk; low source quality |
| 5 | research-how-to (`d50093b3`) | `33 1,5,9,13,17 * * *` | `research-how-to` | Candidate discovery for how-to | tick | none | insufficient evidence |
| 6 | research-rankings (`8db00c8f`) | `3 1,5,9,13,17 * * *` | `research-rankings` | Candidate discovery for rankings | tick | none | insufficient evidence |
| 7 | writer-ai-chatbots (`0dbfb713`) | `49 4,12 * * *` | `writer-ai-chatbots` | Draft package from validated research item | tick | none (draft proposal only) | insufficient source material |
| 8 | writer-sex-tech (`73d15155`) | `49 4,12 * * *` | `writer-sex-tech` | Draft package | tick | none | insufficient source material |
| 9 | writer-vr (`7873cdc7`) | `45 4,12 * * *` | `writer-vr` | Draft package | tick | none | insufficient source material |
| 10 | writer-industry-news (`b7a021e9`) | `53 4,12 * * *` | `writer-industry-news` | News-format draft package (no forced verdict) | tick | none | stale/insufficient sourcing |
| 11 | writer-how-to-rankings (`5d0804aa`) | `47 4,12 * * *` | `writer-how-to-rankings` | Draft package for how-to & rankings | tick | none | insufficient source material |
| 12 | affiliate-injector (`70e3c84a`) | `30 5 * * *` | `affiliate-injector` | End-rail + affiliate intent proposal | tick | none | new-program recommendation → review_escalations |
| 13 | qc-publisher (`85064c6f`) | `55 6 * * *` | `qc-publisher` | Publish/hold/reject scorecard | tick | none | any fact_check severity |
| 14 | affiliate-health-checker (`d404800b`) | `23 8 * * *` | `affiliate-health-checker` | Read-only URL health observations | tick | none (writes via orchestrator only) | persistent inconclusive |
| 15 | persona-auditor (5 audit crons, AUDITOR-SPEC) | weekly Sundays | `persona-auditor` | Post-publish persona scorecards (report-only) | tick (shadow: simulated) | none | below-threshold score (after calibration only) |
| +1 | — | — | `visual-director` | Visual brief per draft | tick | none | asset provenance unclear |

Legacy compatibility plan: legacy crons keep firing untouched during shadow mode. At
cutover (Brent-approved), each legacy cron is disabled in the Pollinations session after
the new pipeline has demonstrated ≥3 clean daily cycles; rollback is re-enabling crons
(cron texts preserved verbatim in `user_supplied/pipeline/baselines/`).

---

## 2. Target architecture

```
                    ┌──────────────────────────────────────────────────┐
                    │                Neon Postgres                      │
                    │  canonical: posts, affiliates, agent_instructions │
                    │  new: work_items, agent_runs, agent_leases,       │
                    │       review_escalations, media_assets,           │
                    │       end_rail_plans, affiliate_health_checks,    │
                    │       publish_decisions, orchestration_events     │
                    └───────────────▲──────────────────────────────────┘
                                    │
        ┌───────────────────────────┴─────────────────────────────┐
        │                      ORCHESTRATOR (code)                 │
        │  scheduler · eligibility · queue/claim/lease · state     │
        │  machine · schema validation · retries/backoff/DLQ ·     │
        │  concurrency caps · budgets · circuit breaker ·          │
        │  operator-instruction pickup · dry-run/shadow gates ·    │
        │  affiliate resolution · media pipeline · publish auth ·  │
        │  audit log · run summaries                               │
        └───────▲───────────────────────────────────▲──────────────┘
                │ JSON work packet                  │ authorized API calls
                │ (no secrets)                      │ (admin token via env)
        ┌───────┴────────┐                 ┌────────┴─────────┐
        │ 15+1 PROMPT    │                 │ PulseNSFW API     │
        │ AGENTS         │                 │ (existing routes) │
        │ stateless,     │                 │ draft/publish/    │
        │ schema in/out  │                 │ research mutation │
        └────────────────┘                 └──────────────────┘
```

### 2.1 Prompt-agent boundary (hard rules)

Every prompt agent is effectively stateless and side-effect-free. It:

- receives a minimal JSON work packet (never secrets, never raw credentials, never raw
  affiliate URLs — only registry *metadata* explicitly supplied by the orchestrator);
- returns schema-valid structured JSON only (validated before acceptance);
- explains refusal, uncertainty, insufficient evidence and escalation via structured
  fields (`status: ok|refused|escalate`, `confidence`, `uncertainty[]`, `escalation{}`);
- never schedules, claims, retries, publishes, mutates state, or switches category.

Forbidden for all agents: credentials access · secrets in prompts · scheduling ·
publishing · state mutation · hardcoded affiliate URLs · unverified-claim-as-fact ·
silent category/intent switching.

### 2.2 Orchestrator boundary (owns everything the agents don't)

- Job creation, eligibility, queueing, claiming, leasing (`agent_leases`), stale-lease
  recovery; idempotency keys on `work_items.idempotency_key` (unique).
- Explicit, validated, idempotent state transitions with actor/run identity, timestamps,
  reasons; illegal transitions rejected; ambiguous API timeouts reconciled before publish
  retry.
- Prompt-agent invocation via a pluggable invoker (see §8) with prompt-version/model
  recording on every `agent_runs` row.
- Input/output JSON-schema validation (Zod, the repo's existing validation library).
- Concurrency caps per role & category; budgets; exponential backoff with jitter;
  dead-letter after bounded attempts; retry classification.
- Circuit breaker + global pause from `agent_instructions` (central enforcement —
  individual agents never interpret operator commands).
- Only component permitted to create/update drafts and publish — and publish only when
  QC recommendation is `publish` **and** all deterministic gates pass.
- Dry-run/shadow gating: in `dry_run` or `shadow` mode every mutation is suppressed and
  recorded in `orchestration_events`.
- Backfill isolation: historical-post backfill is a separate queue (`work_items.queue =
  'backfill'`) that never runs without Brent's explicit enablement.

---

## 3. Canonical data & source-of-truth map

| Data | Canonical store | Change |
|---|---|---|
| Posts (drafts & published) | Neon `posts` | unchanged; pipeline fields added via new tables (no destructive change) |
| Brand-level affiliate registry | Neon `affiliates` | unchanged; health state now tracked in `affiliate_health_checks` (new table), registry rows untouched by pipeline |
| Operator instructions | Neon `agent_instructions` | **retained & extended** (see §10); DDL added defensively |
| Research frontier | `/data` markdown files (legacy) | **mirrored into `work_items` on ingest**; legacy files remain untouched legacy inputs during shadow; never deleted |
| Lovense SKU layer | `affiliates/lovense-links.json` | ingested read-only by orchestrator (env-overridable path); file stays the second tier |
| Brand copy | `shared/brand.ts` (new, centralized) | single source for tagline/descriptor |
| Prompt packages | `prompts/` (new, versioned) | consumed by orchestrator at run time |

No second queue, no JSON workflow tracker, no shadow state system: everything the new
pipeline owns lives in Neon.

---

## 4. State machine

States (stored on `work_items.state`):

```
 discovered → research_validated → ready_to_write → claimed → in_progress
   → draft_proposed → draft_persisted → visual_pending → visual_ready
   → end_rail_pending → end_rail_validated → qc_pending → {qc_pass|qc_hold|qc_reject}
   → publish_eligible → published → audit_pending → audit_completed
```

Failure/exception states: `research_rejected`, `needs_visual`, `retryable_failure`,
`terminal_failure` (dead letter), `human_review`, `paused`.

Mandatory capabilities per instruction §State-machine:

- explicit validated transitions (`VALID_TRANSITIONS` in `server/orchestrator/state-machine.ts`);
- actor + run identity + timestamp + reason on every transition (written to
  `orchestration_events` and `work_items.transition_history`);
- idempotent transition application (re-applying a completed transition is a no-op with
  same run id);
- ambiguous-timeout reconciliation: publish calls are wrapped so that timeout/unknown
  outcomes trigger a **reconcile step** (read post status; if draft → treat as not
  published; if published → record outcome and mark item published) before any retry;
- prior evidence preserved: transitions append, never overwrite.

Key gates encoded deterministically:

- `draft_proposed → draft_persisted`: orchestrator-only (POST /api/admin/posts).
- `visual_ready` requires media status `ready` + non-empty alt text; else `needs_visual`.
- `end_rail_validated` requires end-rail plan validated against registry + health.
- `publish_eligible` requires QC `publish` + all deterministic gates (word count, meta
  lengths, internal links in `/posts/[slug]` form, no raw affiliate URLs, media ready,
  end-rail valid, brand copy compliant).
- Publishing never happens on retry without reconciliation.

---

## 5. Publishing authorization flow

```
work_item → draft_persisted → visual_ready → end_rail_validated → qc_pending
   → qc-publisher agent returns {recommendation, scorecard}
   → orchestrator recomputes ALL deterministic gates independently
   → if recommendation == publish AND gates pass → publish_eligible → PUBLISH (only actor)
   → if hold/reject OR any gate fails → qc_hold / qc_reject with reasons + remediation
   → publish → audit_pending → persona-auditor (report-only) → audit_completed
```

Writers never set status; QC never calls publish; the orchestrator is the only component
that talks to the publish endpoint, and only from `publish_eligible` state, in
`production` mode, with a recorded `publish_decisions` row and idempotency key.

---

## 6. Affiliate-resolution flow

```
end-rail planning (affiliate-injector agent):
  input  = draft context + ALLOWED registry metadata (names/categories/keywords only, no URLs)
  output = end-rail plan {related intents, affiliate intent, eligibility rationale}
           — never a URL
orchestrator resolution:
  1. resolve affiliate_registry_id against Neon `affiliates` (must exist, active,
     tracking_status healthy, health-check current & eligible)
  2. for Lovense: run SKU matcher against lovense-links.json
     exact product → bundle → landing page → fallback(⚠ home fallback currently
     REDIRECT-TO-HOME = ineligible per PIPELINE_STATE 2026-09-13) → no match
  3. eligibility = active ∧ healthy ∧ contextually relevant ∧ not redirect-to-home
     ∧ not rate-limited-inconclusive-treated-as-dead
  4. no eligible match → internal_only mode (always available)
  5. untracked program found → review_escalations row (never an injected link)
```

Health states: `healthy | redirect | redirect_to_home | rate_limited_inconclusive |
broken | disabled | expired | unknown`. Only `healthy` (and `redirect` with preserved
tracking, per Brent) may back an affiliate CTA. `rate_limited_inconclusive` never
classifies a link dead. Health checks are rate-limited and backoffed per domain.

---

## 7. Visual asset flow

`visual-director` agent produces a structured **visual brief** (proposal only).
Orchestrator owns generation/storage/attachment decisions; in shadow mode nothing is
generated or uploaded — briefs are recorded and items advance to `needs_visual` /
`visual_pending` per fixture outcome. Contract: every publishable post requires a media
asset with `status: ready`, non-empty usable alt text, and provenance
(`asset_source`, `rights_licensing_status`, `content_safety_classification`). Historical
posts are never touched; a separate isolated `backfill` queue exists but is disabled
without Brent's approval.

---

## 8. Agent invocation & runtime

- **Invoker interface** (`server/orchestrator/invoker.ts`): `invoke(agentId, workPacket, meta)`
  → validated JSON. Pluggable implementations:
  - `PollinationsInvoker` — OpenAI-compatible call to Pollinations text API, prompt-package
    system prompt + JSON work packet; response parsed & schema-validated. No secrets sent.
  - `PollinationsPaidInvoker` — paid escalation on Pollinations' own paid platform
    (`gen.pollinations.ai`, OpenAI-compatible, account API key + Pollen billing); same
    provider/account path as the free tier, no third-party router. Dormant until armed.
  - `EchoInvoker` — deterministic stub used by tests and shadow mode (fixture-driven), so
    shadow runs require **no network calls at all**.
- The orchestrator itself runs as a code agent / Render cron tick (per Brent: Render cron
  on the existing service, invoked via `POST /api/orchestrator/tick`); shadow mode runs
  locally with no production credentials.

---

## 9. Security boundary

- Secrets: env-var names only in code/docs (`ADMIN_API_TOKEN`, `DATABASE_URL`,
  `LOVENSE_LINKS_PATH`, `ORCHESTRATOR_MODE`, `POLLINATIONS_*`). No secret values in
  prompts, code, fixtures, logs, docs, or commits. (This repo's legacy state violates
  this — see §14 — and remediation is gated on Brent.)
- Prompt agents receive no credentials; the orchestrator holds the admin token server-side.
- Redaction: the structured logger redacts values matching token-shaped patterns before
  any output; prompts and outputs are hashed (sha256) into `agent_runs`, not stored raw.
- Scope: agent tokens for the new pipeline are minted via the existing
  `POST /api/admin/tokens` (label `agent:orchestrator`) at cutover time by Brent; shadow
  mode uses none.

---

## 10. Operator-instruction / pause flow

`agent_instructions` (existing) is the canonical operator-command channel. The
orchestrator:

1. on every tick, reads active instructions (`target = 'all'` or its role set);
2. applies **global pause/halt** before any dispatch (circuit breaker open);
3. applies targeted instructions, appending `{agent, seen_at}` to `consumed_by`,
   deactivating `persist=false` rows after acting;
4. records pickup in `orchestration_events` for audit;
5. never performs a production action while a valid global halt is active.

New DDL (defensive `CREATE TABLE IF NOT EXISTS` mirroring the live table's columns) is
included so fresh environments (CI/preview branches) have the table; live Neon already
has it and is not altered.

---

## 11. Shadow-mode strategy

- Mode precedence: `dry_run` ⊂ `shadow` ⊂ `production` (env `ORCHESTRATOR_MODE`).
- In shadow: agent invocations run (echo/fixture-backed), proposals/briefs/plans/scorecards
  are recorded, transitions progress through the state machine, and **every mutation-type
  action (draft create/update, research mutation, publish, affiliate change, media upload,
  external email) is suppressed and journaled as `side_effect_suppressed`** in
  `orchestration_events`.
- Run ledger = `agent_runs` + `orchestration_events` — the evidence that no side effects
  occurred.
- Shadow example fixtures (≥10, spanning required edge cases) live in
  `shadow/fixtures/` and run via `npm run shadow:run`.

---

## 12. Rollback strategy

1. Feature-flag: `ORCHESTRATOR_ENABLED=false` (Render env) — new endpoints and cron ticks
   no-op immediately.
2. Legacy crons are untouched during shadow; rollback = never enable.
3. If enabled then rolled back: disable the Render cron job that calls
   `/api/orchestrator/tick`, set `ORCHESTRATOR_ENABLED=false`, re-enable legacy crons in
   the Pollinations session (verbatim texts preserved in baselines).
4. Migrations are additive-only; rollback notes in each migration file list the exact
   `DROP TABLE`/`ALTER ... DROP` statements (safe because no legacy table is modified
   except the defensive `agent_instructions` DDL which is a no-op on Neon).
5. No data loss path: the new pipeline never deletes or overwrites posts, research files,
   or affiliate rows; it only appends new tables + new columns on `posts` (nullable).

---

## 13. Backfill isolation

`work_items.queue` ∈ `daily | backfill`. Backfill items (historical posts needing
visual/end-rail remediation) are created only by an explicit seeding script, live in a
separate queue, and the orchestrator refuses to dispatch from `backfill` unless
`ORCHESTRATOR_BACKFILL_ENABLED=true` **and** Brent has approved the run. Default: off.

---

## 14. Conflicts found & smallest-safe resolutions

| # | Conflict | Resolution |
|---|---|---|
| 1 | Instruction says "retain existing `agent_instructions` table"; live Neon has it but repo has no DDL | Defensive `CREATE TABLE IF NOT EXISTS` with identical columns; no alteration of live table |
| 2 | Instruction: Neon is canonical for research; repo serves research from markdown files | Mirror research items into `work_items` at ingest; legacy files remain untouched; no dual-write to legacy files |
| 3 | `affiliates/lovense-links.json` referenced as repo-canonical; not present in repo (only `user_supplied/`) | Orchestrator loads it via `LOVENSE_LINKS_PATH` env (defaults to `user_supplied/affiliates/lovense-links.json`); file not committed |
| 4 | Legacy baseline cron texts & persona spec contain live bearer tokens; master token hardcoded in `server/migrate.ts` | `user_supplied/` gitignored (never committed); migration tokens flagged for Brent's rotation; no secret copied into any new artifact |
| 5 | Lovense home fallback (`/r/3ss45r`) is a required tier in supplied matching doc, but PIPELINE_STATE marks it REDIRECT-TO-HOME ineligible | Matcher implements the tier but marks it ineligible by default (`ORCHESTRATOR_ALLOW_REDIRECT_HOME=false`), overridable only by explicit Brent config |
| 6 | Persona auditor emails Brent per AUDITOR-SPEC; instruction forbids external comms | Auditor is report-only and produces structured records; email dispatch is an orchestrator side effect, suppressed in shadow and gated at cutover |
| 7 | Baseline QC allowlists hardcoded affiliate URLs in prompt text | Eliminated: QC receives no URLs; orchestrator validates affiliate eligibility against Neon at runtime |

---

## 15. Acceptance checklist (maps to instruction §Completion criteria)

- [x] Architecture doc (this file) — legacy mapping, state machine, flows, security, shadow, rollback, backfill
- [ ] Migrations + data layer (B)
- [ ] Orchestrator (C)
- [ ] Prompt packages + fixtures (D)
- [ ] Site integration (E)
- [ ] Tests (F) — 35 required cases
- [ ] Shadow run + ledger + evidence (G)
- [ ] Brent approval gates listed (final evidence package)
