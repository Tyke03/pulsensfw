-- 004_budget_ledger.sql — durable atomic daily budget ledger for paid-model calls.
--
-- Adds:
--   1. paid_budget_days          — one row per UTC day: budget + reserved/settled/released.
--   2. paid_budget_reservations  — per-call reservation rows (audit + reconciliation).
--   3. agent_runs integrity      — tier constrained to the known ladder, cost non-negative.
--
-- Concurrency model: authorization is the guarded upsert of the day row
-- (budget_usd - reserved_usd - settled_usd >= amount re-checked under the
-- unique-index row lock), so overlapping ticks can never exceed the cap.
-- All amounts are NUMERIC(12,6) — no float money.
--
-- UTC: `day` is a DATE populated from the application's UTC clock
-- (budget-ledger.utcDay()); Postgres DATE carries no timezone, so the durable
-- key is unambiguous regardless of server timezone.
--
-- Non-destructive: additive only; no existing rows or columns are altered.
--
-- ROLLBACK NOTES (reverse order):
--   ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_cost_usd_non_negative;
--   ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_tier_allowed;
--   DROP TABLE IF EXISTS paid_budget_reservations;
--   DROP TABLE IF EXISTS paid_budget_days;
-- (Indexes disappear with their tables.)

-- ── 1. Daily budget day rows ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paid_budget_days (
  day          DATE PRIMARY KEY,
  budget_usd   NUMERIC(12,6) NOT NULL CHECK (budget_usd > 0),
  reserved_usd NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  settled_usd  NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (settled_usd >= 0),
  released_usd NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (released_usd >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Per-call reservations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paid_budget_reservations (
  id            UUID PRIMARY KEY,
  day           DATE NOT NULL REFERENCES paid_budget_days(day),
  work_item_id  INTEGER REFERENCES work_items(id) ON DELETE SET NULL,
  role          TEXT,
  tier          VARCHAR(20) NOT NULL,
  model         TEXT,
  amount_usd    NUMERIC(12,6) NOT NULL CHECK (amount_usd > 0),
  state         VARCHAR(24) NOT NULL DEFAULT 'reserved'
                CHECK (state IN ('reserved','settled','released','reconciliation_needed')),
  settled_usd   NUMERIC(12,6) CHECK (settled_usd IS NULL OR settled_usd >= 0),
  cost_basis    VARCHAR(40) CHECK (cost_basis IN ('provider_reported_actual','conservative_estimate')),
  reserved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at  TIMESTAMPTZ,
  -- A reservation is either open ('reserved') or explicitly finalized.
  CHECK (state = 'reserved' OR finalized_at IS NOT NULL),
  -- Settled amount only exists on settled rows; cost basis only on settled.
  CHECK (settled_usd IS NULL OR state IN ('settled','reconciliation_needed')),
  CHECK (cost_basis IS NULL OR state = 'settled')
);

-- Sweeper hot path: open reservations older than the TTL.
CREATE INDEX IF NOT EXISTS idx_budget_res_open
  ON paid_budget_reservations (reserved_at)
  WHERE state = 'reserved';
-- Status/reconciliation reads by day and state.
CREATE INDEX IF NOT EXISTS idx_budget_res_day_state
  ON paid_budget_reservations (day, state);

-- ── 3. agent_runs integrity (existing table, additive constraints) ──────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_tier_allowed') THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT agent_runs_tier_allowed
      CHECK (tier IN ('free','paid_tier1','paid_tier2'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_cost_usd_non_negative') THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT agent_runs_cost_usd_non_negative
      CHECK (cost_usd >= 0);
  END IF;
END $$;
