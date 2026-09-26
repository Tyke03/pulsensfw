# PulseNSFW Agent-Fleet Transition — Evidence & Cutover Package

Status: **Shadow-mode implementation complete** · Branch `feat/agent-fleet-orchestrator` · 2026-09-25
All production-impacting actions remain gated on Brent's explicit approval (§Approval gates).

---

## 1. What changed (file-level summary)

**New — architecture & docs**
- `docs/ARCHITECTURE.md` — legacy-cron→agent mapping, state machine, all flows, conflict log
- `docs/EVIDENCE.md` — this file

**New — data layer**
- `shared/schema.ts` — extended (additive): work_items, agent_runs, agent_leases, review_escalations, media_assets, end_rail_plans, affiliate_health_checks, publish_decisions, orchestration_events, agent_instructions
- `server/migrations/001_agent_fleet.sql` — additive DDL with rollback notes + defensive `agent_instructions` DDL (no-op on live Neon)
- `server/migrate-v2.ts` — idempotent migration runner (`npm run migrate:v2`)

**New — orchestrator (Deliverable C)**
- `server/orchestrator/state-machine.ts` — explicit/idempotent transitions, illegal-transition rejection
- `server/orchestrator/engine.ts` — tick loop: instruction pickup, claims/leases, invocation, run recording, retry/backoff/DLQ, side-effect suppression journaling
- `server/orchestrator/leases.ts` — single-owner leases, expiry/recovery, stale-worker rejection
- `server/orchestrator/instructions.ts` — central `agent_instructions` enforcement (pause/halt, one-shot vs persist, consumed_by audit)
- `server/orchestrator/invoker.ts` — EchoInvoker (offline) + PollinationsInvoker (OpenAI-compatible); sha256 input/output hashing
- `server/orchestrator/packages.ts` — 16 versioned prompt-agent packages with Zod in/out schemas
- `server/orchestrator/affiliate-resolution.ts` — registry eligibility, Lovense 4-tier SKU matcher, redirect-to-home blocking
- `server/orchestrator/policies.ts` — deterministic publish gates (word count, meta, links, raw-affiliate ban, news_fit, media, end-rail, straight-news guard)
- `server/orchestrator/end-rail.ts` — related-post selection + plan validation

**New — prompt packages (Deliverable D)**
- `prompts/<16 agent IDs>.md` — versioned packages mirroring the machine registry

**New — site integration (Deliverable E)**
- `shared/brand.ts` — centralized brand copy, routing policy, word-count policy, end-rail policy, URL rules
- `client/src/components/ArticleEndRail.tsx` — reusable end-rail (internal path + gated affiliate CTA + disclosure + internal-only fallback)
- `POST /api/end-rail/:slug` in `server/routes.ts` — published-only related selection
- PostPage renders ArticleEndRail

**Changed — brand repositioning (no review-only wording remains)**
- `client/index.html`, `client/src/lib/useDocumentHead.ts`, `client/src/pages/Blog.tsx`

**Changed — safety-critical infra**
- `server/db.ts` — SSL only for non-local DATABASE_URL (Neon still SSL; local test Postgres works)
- `tsconfig.json` — target ES2022 (fixes iterator compilation; client-only errors pre-exist)
- `package.json` — scripts: `test`, `shadow:run`, `migrate:v2`

**New — tests (Deliverable F)**
- `tests/setup.ts`, `tests/affiliates.test.ts`, `tests/policies.test.ts`, `tests/packages.test.ts`, `tests/orchestrator-db.test.ts`

**New — shadow mode (Deliverable G)**
- `shadow/shadow-scenarios.json` — 10 required scenarios
- `shadow/run-shadow.ts` — runner; `shadow/shadow-ledger.json` — evidence ledger

**Not committed (secrets)**
- `user_supplied/` — gitignored; contains live bearer tokens in legacy baseline cron texts

---

## 2. Test results

```
Command:  npm test            (tsx --test tests/*.test.ts)
Result:   57/57 pass, 0 fail, 0 skipped
Scope:    schema fixtures (all 16 agent packages), state machine (legal paths,
          illegal rejection, idempotency, append-only history), leases (double-claim,
          expiry recovery, stale-worker rejection, non-owner release), operator
          instructions (global halt, one-shot consumption), shadow suppression,
          publish authorization (never publishes in shadow; gates block failing
          drafts; dead-letter on schema failure), affiliate registry eligibility,
          Lovense specificity/ineligible-fallback, health-status gating, 429
          inconclusive semantics, redirect-to-home distinction, related-post
          selection safety, URL-rule regression (/posts/ vs /#/post/), brand
          positioning audit, no-hardcoded-affiliate-URL audit.
Requires: local Postgres (docker run -d --name pulsensfw-test-pg -e
          POSTGRES_PASSWORD=testpass -e POSTGRES_DB=pulsensfw_test -p 5433:5432 postgres:16-alpine)
```

Pre-existing `client/` typecheck errors (react-query header typing in `api.ts`,
`AdminAffiliates.tsx`) are unrelated to this branch and were not introduced here;
server/shared/orchestrator typecheck clean.

---

## 3. Database migrations

| File | Impact | Rollback |
|---|---|---|
| `001_agent_fleet.sql` | Creates 10 new tables + indexes; `agent_instructions` via `CREATE TABLE IF NOT EXISTS` (no-op on live Neon) | `DROP TABLE orchestration_events, publish_decisions, affiliate_health_checks, end_rail_plans, media_assets, review_escalations, agent_leases, agent_runs, work_items CASCADE;` — no legacy table touched |

Apply to Neon dev/preview branch only, pending Brent's approval (GitHub Actions
workflow below creates per-PR branches automatically).

---

## 4. Shadow-mode results (`shadow/shadow-ledger.json`)

**10/10 scenarios passed · mode `shadow` · production side effects: 0 · posts published: 0**

| Scenario | Verifies |
|---|---|
| S01 industry-news accepted | consumer-interesting candidate passes news_fit, writer item created with dedupe key |
| S02 industry-news rejected | dry legal/B2B lead refused with structured escalation, nothing queued |
| S03 routed away | device launch escalated as category_routing_mismatch (Sex Tech, not News) |
| S04 eligible affiliate | Edge 2 → product-tier registry match, affiliate mode + disclosure |
| S05 internal-only | no-context draft → internal_only fallback |
| S06 blocked visual | empty alt text → needs_visual; no production post |
| S07 Lovense specificity | Solace Pro → `product:solace-pro` (not fallback) |
| S08 fallback ineligible | Lush 4 relevance + redirect-to-home → internal_only |
| S09 health 429 | `rate_limited_inconclusive` recorded (never "dead"); redirect_to_home distinguished |
| S10 global halt | persist halt stops tick before dispatch; consumed_by audited |

Suppression journaling is visible per scenario in the ledger
(`suppressedCount`), proving draft-create/research-mutation/publish side effects
were suppressed in shadow mode. Repeat the run anytime: `npm run shadow:run`.

---

## 5. Secrets audit

- `grep` for legacy token values across all changed/new files: **0 hits**.
- `user_supplied/` (contains plaintext tokens in legacy cron baselines) is gitignored.
- Live Neon `agent_instructions` table untouched; new DDL is defensive only.
- `shadow/shadow-ledger.json` and all fixtures contain no tokens.

**Outstanding (Brent action required):** legacy bearer tokens in cron texts and the
hardcoded master token in `server/migrate.ts` predate this branch and should be
rotated after cutover approval.

---

## 6. Proposed production cutover sequence (requires Brent approval)

1. Merge branch → Neon preview branch created automatically via GitHub Actions (§7).
2. Render env: `ORCHESTRATOR_MODE=shadow`, `ORCHESTRATOR_ENABLED=true`.
3. Add Render Cron Job calling `POST /api/orchestrator/tick` every 15 min (shadow).
4. Observe ≥3 clean daily shadow cycles against production data (no side effects).
5. Brent reviews shadow ledger; approves flip:
   `ORCHESTRATOR_MODE=production`, `LOVENSE_LINKS_PATH` set in Render, mint
   `agent:orchestrator` token via `/api/admin/tokens`.
6. One research category first (canary), then remaining categories, then writers,
   end-rail, QC.
7. After 7 consecutive clean production days: disable legacy crons one per day,
   oldest-first, per the mapping in `docs/ARCHITECTURE.md` §1.
8. Rotate all legacy agent tokens + master token.

---

## 7. GitHub Actions — Neon preview branches (Brent requested)

Add `.github/workflows/neon_workflow.yml` with the exact YAML Brent supplied by
Neon. Two required repo secrets must be set first (never committed): `NEON_API_KEY`,
`NEON_PROJECT_ID` (as `vars.NEON_PROJECT_ID`). Not created in this branch until
Brent confirms the secrets exist — the workflow file is ready to paste.

---

## 8. Tested rollback procedure

1. Set `ORCHESTRATOR_ENABLED=false` in Render (immediate no-op of all new endpoints).
2. Remove/disable the orchestrator Render Cron Job.
3. Re-enable legacy crons in the Pollinations session (verbatim task texts preserved
   in `user_supplied/pipeline/baselines/`).
4. Optional DB rollback: the DROP statements in `001_agent_fleet.sql` header. New
   tables only; posts/affiliates/research/instructions data untouched.
5. Legacy file-based research flow resumes exactly where it left off (this branch
   never mutated research files or legacy tables).

---

## 9. Approval gates (all require Brent's explicit approval)

- [ ] Commit + open PR for `feat/agent-fleet-orchestrator`
- [ ] Add `neon_workflow.yml` + set `NEON_API_KEY` / `NEON_PROJECT_ID` repo secrets
- [ ] Apply `001_agent_fleet.sql` to a Neon dev/preview branch
- [ ] Wire orchestrator tick endpoint into the Render service deploy
- [ ] Shadow cron job creation on Render
- [ ] Flip `ORCHESTRATOR_MODE=production`
- [ ] Disable each legacy cron (one-by-one, after clean production days)
- [ ] Rotate legacy agent tokens and the hardcoded master token
- [ ] Historical-post backfill (`ORCHESTRATOR_BACKFILL_ENABLED=true` + seeding script)
- [ ] Persona-auditor calibration thresholds + any auto-revert behavior
- [ ] Final brand copy sign-off in `shared/brand.ts` (proposed wording is the default)
- [ ] Lovense home-fallback: supply validated replacement URL or explicitly authorize home-fallback links

---

## 10. Known gaps / risks

1. **Visual pipeline is brief-only in shadow.** No image generation/upload exists
   yet by design (prohibited in shadow). Production visual generation needs a
   provider decision before cutover (gated).
2. **RESOLVED — live free-tier validation.** The orchestrator drove the real
   Pollinations anonymous-tier `openai-fast` model end-to-end: 5/6 research
   roles returned schema-valid candidates (3 each), with the engine's
   self-correction cycle absorbing a malformed first response. Provider
   outages (transient ENOSPC 500s) were observed to classify as retryable and
   re-enter backoff automatically.
3. **RESOLVED — tick endpoint wired.** `POST /api/orchestrator/tick` +
   `GET /api/orchestrator/status` are live in `server/routes.ts`, gated by
   `ORCHESTRATOR_ENABLED` (default false) and `ORCHESTRATOR_MODE`. Cadence
   seeding (research ~5x/day per category, daily health checks) happens inside
   each tick — one Render Cron Job replaces the whole legacy cron fleet.
   Free-model policy + per-role overrides documented in `docs/RUNTIME.md`.
4. **Pre-existing client typecheck errors** in `api.ts`/`AdminAffiliates.tsx`
   (react-query header typing) remain from before this branch.
5. **Persona auditor** is report-only by design; thresholds require Brent's
   2-week calibration data per `user_supplied/personas/AUDITOR-SPEC.md`.
