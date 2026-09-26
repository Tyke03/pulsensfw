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
| `LOVENSE_LINKS_PATH` | `user_supplied/affiliates/lovense-links.json` | SKU second-tier file |
| `ADMIN_API_TOKEN` | — | Bearer for `/api/orchestrator/tick` (Render env, never committed) |

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
