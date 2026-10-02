# Runtime Operations — Orchestrator, Models, Cadence

## Free-tier model policy (Brent directive: prefer free Pollinations models)

Pollinations' anonymous tier currently exposes exactly one text model:

| Model | Tier | Notes |
|---|---|---|
| `openai-fast` (GPT-OSS 20B, OVH) | **anonymous (free)** | reasoning-capable, tool-calling, JSON-friendly |

**Default for every prompt-agent role: `openai-fast`** — zero cost, no token
required. Per-role upgrades stay possible without code changes:

```
POLLINATIONS_MODEL=openai-fast                      # fleet default (free)
POLLINATIONS_MODEL_QC_PUBLISHER=<better-model>      # optional per-role override
POLLINATIONS_MODEL_WRITER_INDUSTRY_NEWS=<model>     # env key = role, uppercased, non-alnum → _
```

Model choice is recorded per run in `agent_runs.model`, so quality comparison
after shadow cycles is data-driven. If the free tier proves insufficient for a
role, upgrade that role only — the fleet stays free by default.

Note: Pollinations flagged the legacy `text.pollinations.ai` API as
deprecation-planned for *authenticated* users; anonymous requests (ours) are
explicitly not affected. If they later change this, the invoker is
endpoint-agnostic (`POLLINATIONS_ENDPOINT` env) — swap in any
OpenAI-compatible endpoint, including their `enter.pollinations.ai`.

## Environment variables (all optional unless noted)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — (required) | Neon connection string (or local test Postgres) |
| `ORCHESTRATOR_ENABLED` | `false` | Feature flag; `true` activates `/api/orchestrator/*` |
| `ORCHESTRATOR_MODE` | `dry_run` | `dry_run` \| `shadow` \| `production` |
| `ORCHESTRATOR_BATCH` | `10` | Max items claimed per tick |
| `ORCHESTRATOR_ROLE_CONCURRENCY` | `1` | Per-role concurrent claims |
| `ORCHESTRATOR_BACKFILL_ENABLED` | `false` | Backfill queue dispatch (Brent-gated) |
| `POLLINATIONS_ENDPOINT` | `https://text.pollinations.ai/openai` | OpenAI-compatible endpoint |
| `POLLINATIONS_MODEL` | `openai-fast` | Free-tier default |
| `POLLINATIONS_MODEL_<ROLE>` | — | Per-role model override |
| `POLLINATIONS_TOKEN` | — | Only if switching to authenticated tier |
| `PAID_LLM_URL` | — | Paid-tier OpenAI-compatible endpoint (e.g. OpenRouter). **Unset = ladder dormant, zero paid calls** |
| `PAID_LLM_API_KEY` | — | Bearer key for `PAID_LLM_URL`. Required together with URL to arm the ladder |
| `PAID_LLM_MODEL_TIER1` | `deepseek-chat` | Cheap-but-strong escalation model |
| `PAID_LLM_MODEL_TIER2` | `gpt-4o-mini` | Escalation ceiling for hardest tasks |
| `PAID_LLM_DAILY_BUDGET_USD` | `2` | Hard daily paid-spend cap (UTC day) enforced by the atomic ledger; cap hit → falls back to free tier |
| `PAID_LLM_RESERVE_MARGIN` | `0` | Extra headroom fraction reserved on top of the conservative estimate (0–1) |
| `PAID_LLM_RESERVATION_TTL_HOURS` | `6` | Sweeper retains dead-process reservations as reconciliation-needed after this |
| `PAID_LLM_TIMEOUT_MS` | `30000` | Paid-provider request timeout (AbortSignal) |
| `PAID_LLM_MAX_TOKENS_TIER1` | `3000` | max_tokens sent for tier1 calls (caps output exposure; reservation-sized against it) |
| `PAID_LLM_MAX_TOKENS_TIER2` | `3000` | max_tokens sent for tier2 calls |
| `LEDGER_DB_POOL_MAX` | `3` | Max concurrent ledger pool clients (hard clamps 1–20) |
| `LEDGER_DB_CONNECTION_TIMEOUT_MS` | `5000` | Pool acquisition timeout: `pool.connect()` fails fast past this; failure ⇒ `accounting_unavailable` ⇒ paid refused, free runs |
| `LEDGER_DB_IDLE_TIMEOUT_MS` | `30000` | Idle ledger connections are closed after this; frees Neon slots between sparse ticks |
| `LEDGER_DB_LOCK_TIMEOUT_MS` | `4000` | Per-transaction `SET LOCAL lock_timeout`: a contended `FOR UPDATE` aborts (rollback + client release) instead of hanging the tick |
| `LEDGER_DB_STATEMENT_TIMEOUT_MS` | `5000` | Per-transaction `SET LOCAL statement_timeout`: slow ledger statements abort (rollback + client release) instead of hanging the tick |
| `LEDGER_DB_QUERY_TIMEOUT_MS` | — (disabled) | Optional client-side pg `query_timeout` watchdog; server-side statement_timeout is the primary bound |
| `LEDGER_DB_IDLE_TX_TIMEOUT_MS` | — (server default) | Optional `idle_in_transaction_session_timeout` applied at connect; dead-process tx guard |
| `ESCALATE_AFTER_ATTEMPT` | `3` | Failed attempt # that first earns paid_tier1 (tier2 from attempt+3) |
| `LOVENSE_LINKS_PATH` | `user_supplied/affiliates/lovense-links.json` | SKU second-tier file |
| `ADMIN_API_TOKEN` | — | Bearer for `/api/orchestrator/tick` (Render env, never committed) |

## Cost/quality model ladder (dormant until armed)

Brent directive: run every task as cheaply as it can be done; escalate only when a
task proves it needs more; never exceed a hard ceiling.

- **free** (Pollinations `openai-fast`) — always first. Costs $0.
- **paid_tier1** (`deepseek-chat`, ~$0.5/1M tok) — from attempt `ESCALATE_AFTER_ATTEMPT` (default 3).
- **paid_tier2** (`gpt-4o-mini`, ~$1.5/1M tok) — from attempt `ESCALATE_AFTER_ATTEMPT + 3`.

Arming requires BOTH `PAID_LLM_URL` and `PAID_LLM_API_KEY`; without them the
ladder is a pure free-tier passthrough.

**Budget enforcement is fail-closed and atomic** (`server/orchestrator/budget-ledger.ts`):
before any paid call the estimated maximum exposure (reservation input
assumption + tier `max_tokens` at the tier's blended rate, plus optional
`PAID_LLM_RESERVE_MARGIN`) is RESERVED in a durable Postgres ledger
(`paid_budget_days` / `paid_budget_reservations`, migration 004). The day-row
debit is a single guarded upsert, so concurrent orchestrator ticks can never
collectively exceed `PAID_LLM_DAILY_BUDGET_USD` per UTC day. After the callthe reservation is reconciled in an explicit single-client transaction: the
reservation row and the day aggregate move together or not at all —
provider-derived usage replaces the reservation and the unused remainder is
released; on timeout/transport ambiguity the reservation is RETAINED as counted
spend under `reconciliation_needed` (never silently released — an operator
resolves via `resolveReconciliation`); stale reservations from dead processes
are retained by a TTL sweeper that runs BEFORE every reserve (a sweep failure
is an accounting outage: paid is refused and free runs). If the ledger itself
is unreachable, paid escalation is REFUSED (free runs instead, the
`budget_accounting_unavailable_fallback` event is journaled) — accounting
failure never permits paid use.

**Every ledger transaction is time-bounded** (no unbounded waits):

- **Acquisition** — the pool's `connectionTimeoutMillis`
  (`LEDGER_DB_CONNECTION_TIMEOUT_MS`, default 5000) bounds `connect()`. A
  saturated or unreachable database fails FAST and the invocation maps to
  `accounting_unavailable`: paid refused, free runs with
  `accountingFallback: true`, zero paid calls.
- **Statement + lock waits** — `withLedgerTx` issues
  `SET LOCAL lock_timeout` / `SET LOCAL statement_timeout` (4s / 5s defaults)
  immediately after `BEGIN`, scoped to that transaction only. A contended
  `FOR UPDATE` or a slow statement aborts with a query error → the transaction
  ROLLS BACK and the client is released (both guaranteed in `finally`) — a
  lock wait or slow query can never hang an orchestrator tick indefinitely.
- **No HTTP inside transactions** — ledger transactions never span an external
  model-provider call: reserve completes and commits, the provider call runs
  with no transaction open, then finalize runs its own short transaction.
- **Transaction-capable wiring is mandatory** — the ledger db must expose
  `connect()` (a pg Pool does). A query-only surface cannot run the explicit
  two-row transactions, so it is refused (`ledger_db_not_transaction_capable`)
  and reported as `accounting-unavailable` — never silently run
  non-transactionally. Every caller maps that refusal to `accounting_unavailable`
  → paid escalation refused, free tier runs (fail-closed).
- Statement counts are tiny (all finalizers touch exactly two rows), so the
  timeouts are safety nets, not throughput controls. Tune only with evidence
  (pg_stat_statements / Neon metrics), keeping statement_timeout comfortably
  above the paid-provider timeout path.

**Cost semantics:** `agent_runs.cost_usd` and the ledger record
derived-or-conservative-estimated cost. Cost-basis labels state the EVIDENCE:
`cost_basis = 'provider_usage_derived_estimate'` when the provider returns
token usage (usage × locally configured blended rates — a DERIVED estimate,
not a bill); `'conservative_reservation_estimate'` when no usage is available
(maximum plausible exposure); `'provider_billed_actual'` is RESERVED for a
provider-returned billed-cost field consumed verbatim (no code path produces
it yet). No literal billed-spend guarantee is claimed unless the configured
endpoint returns reliable usage.

**Rollback policy (ledger):** runtime rollback of the code is `git revert` +
redeploy; the ledger tables and their data are PRESERVED — they are the audit
record, and reverted code simply stops touching them. `DROP TABLE` is not an
immediate post-production rollback step. A future archival / down-migration
(explicit, operator-run, data-preserving: export reservations → export day
aggregates → drop the agent_runs constraints → drop reservations → drop day
rows) is documented in the migration 004 header and intentionally not
automated.

Every paid run — success, failure, or schema_invalid — journals a
`model_escalation` event (with cost basis + reservation id) and records tier +
cost in `agent_runs.tier` / `agent_runs.cost_usd` (constrained to the known
tiers, non-negative costs). Live readout: `GET /api/orchestrator/status` →
`ladder.{enabled,tier1Model,tier2Model,dailyBudgetUsd,accountingStatus,budget}`
where `accountingStatus` ∈ disabled \| free-only \| accounting-ready \|
budget-exhausted \| accounting-unavailable. No secrets are exposed.
`ladder.poolHealth` carries NON-SECRET NUMERIC pool/ledger health only —
`totalClients`, `idleClients`, `waitingClients`, `poolMax`,
`connectionTimeoutMs`, `idleTimeoutMs`, `lockTimeoutMs`, `statementTimeoutMs`
(all numbers or null). The payload structurally cannot contain the DSN, host,
user, database name, tokens, or SQL text.

### Recommended initial pool configuration

Ship with the defaults: `LEDGER_DB_POOL_MAX=3`,
`LEDGER_DB_CONNECTION_TIMEOUT_MS=5000`, `LEDGER_DB_IDLE_TIMEOUT_MS=30000`,
`LEDGER_DB_LOCK_TIMEOUT_MS=4000`, `LEDGER_DB_STATEMENT_TIMEOUT_MS=5000`,
`LEDGER_DB_QUERY_TIMEOUT_MS` unset.

Why: the ledger is a low-volume, latency-sensitive dependency — a handful of
short two-row transactions per 15-minute tick. Three clients cover overlapping
paid invocations with wide headroom while keeping total connection pressure on
the shared Neon database minimal (ledger pool + app pool + operators ≪ Neon's
connection limit; ~1/3 of a ~100-connection direct limit and ~1/10 of a pooler
endpoint's). The 5s acquisition timeout fails fast into fail-closed free
fallback instead of queueing ticks; 30s idle reaping releases Neon slots
between sparse ticks; the 4s/5s lock/statement bounds mean degradation aborts
and frees locks rather than hanging a tick while holding row locks.

### Post-deploy checks (do these after any ledger-touching deploy)

1. **Pool waiters** — `GET /api/orchestrator/status` → `ladder.poolHealth`:
   confirm `waitingClients` is 0 at steady state and that
   `totalClients ≤ poolMax` (sustained nonzero waiting ⇒ raise acquisition
   timeout only after investigating; never raise pool size to mask leaks).
2. **Accounting fallbacks** — grep recent orchestration events for
   `budget_accounting_unavailable_fallback` (status counters stay at zero
   incidents expected). Any occurrence means the ledger was unreachable or
   saturated — treat as an accounting outage, not a free-tier preference.
3. **Failed transaction count** — query Neon for aborted transactions and
   statement timeouts attributable to `application_name =
   'pulsensfw-budget-ledger'` (e.g. `pg_stat_database` deadlocks/rollbacks and
   `pg_stat_statements` for timeout errors). A rising trend means lock/statement
   bounds are too tight or a dependency is slow — tune before arming paid.
4. Only after all three are clean on the deployment AND Brent grants separate
   approval: `PAID_LLM_URL` / `PAID_LLM_API_KEY` may be considered. **Paid
   escalation stays disabled until that separate approval — deployment
   verification alone does not arm the ladder.**
Suggested OpenRouter config: `PAID_LLM_URL=https://openrouter.ai/api/v1/chat/completions`
with models like `deepseek/deepseek-chat` / `openai/gpt-4o-mini`.

## Scheduling model (replaces legacy cron fleet)

One Render Cron Job calls `POST /api/orchestrator/tick` every 15 minutes with
`Authorization: Bearer $ADMIN_API_TOKEN`. The orchestrator then:

1. checks `agent_instructions` (global halt short-circuits everything);
2. seeds due work items — research per category on 4-hour windows (~5x/day,
   mirroring legacy cadence), daily health checks (idempotent keys, no duplicates);
3. claims eligible items within concurrency caps and executes stages;
4. chains follow-on items (research candidate → writer draft → end-rail → QC).

Legacy cron schedules → new cadence mapping lives in `docs/ARCHITECTURE.md` §1.

## Local runbook

```bash
# one tick, shadow mode, no network needed (fixtures):
npm run shadow:run

# one tick against Neon/local with live Pollinations free model:
ORCHESTRATOR_MODE=shadow DATABASE_URL=... npx tsx scripts/tick.ts

# status:
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" https://pulsensfw-x9kr.onrender.com/api/orchestrator/status
```

## API endpoints (both tokenAuth-gated, feature-flagged)

- `POST /api/orchestrator/tick` — one orchestration cycle (404 unless `ORCHESTRATOR_ENABLED=true`)
- `GET /api/orchestrator/status` — enabled/mode + work-item/run/event counters

## Provider outage behavior

Live-verified: provider HTTP 500s classify as **retryable** → items enter
bounded exponential backoff and are automatically retried on later ticks; every
attempt is recorded in `agent_runs`. No manual intervention needed for transient
provider failures; persistent failures surface via `review_escalations` after
`max_attempts` (default 5).
