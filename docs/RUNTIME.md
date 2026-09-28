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
| `PAID_LLM_DAILY_BUDGET_USD` | `2` | Hard daily paid-spend cap (UTC day); cap hit → falls back to free tier |
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
ladder is a pure free-tier passthrough. Daily paid spend is read live from
`agent_runs.cost_usd` (UTC day) and hard-capped at `PAID_LLM_DAILY_BUDGET_USD`;
when the cap would be exceeded the call silently runs free instead and a
`budget_cap_fallback` event is journaled. Every paid run — success, failure, or
schema_invalid — journals a `model_escalation` event and records tier + cost in
`agent_runs.tier` / `agent_runs.cost_usd`. Live readout: `GET
/api/orchestrator/status` → `ladder.{enabled,tier1Model,tier2Model,dailyBudgetUsd,paidSpendTodayUsd}`.
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
