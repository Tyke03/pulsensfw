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
-- ROLLBACK / DOWNGRADE POLICY (corrected):
--   Runtime rollback of the CODE is `git revert` + redeploy. Ledger tables and
--   data are PRESERVED — they are an audit record; the reverted code simply
--   stops reading/writing them. DROP TABLE is NOT an immediate post-production
--   rollback step.
--   A future archival / down-migration procedure (explicit, operator-run,
--   data-preserving) would be, in dependency order: export reservations to
--   archive storage → export day aggregates → drop the two agent_runs
--   constraints → drop paid_budget_reservations → drop paid_budget_days.
--   It is intentionally NOT automated here.

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
  -- Cost-basis labels state the EVIDENCE: usage × configured rates is a
  -- DERIVED estimate (not a provider bill); only a provider-returned
  -- billed-cost field consumed verbatim may be provider_billed_actual.
  cost_basis    VARCHAR(40) CHECK (cost_basis IS NULL OR cost_basis IN
                  ('provider_usage_derived_estimate','conservative_reservation_estimate','provider_billed_actual')),
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

-- ── 4. Cost-basis terminology migration (v2) ─────────────────────────────────
-- Prior deployments of this migration recorded 'provider_reported_actual' for
-- costs DERIVED from provider token usage at locally configured rates, and
-- 'conservative_estimate' for maximum-plausible-exposure sizing. Those labels
-- overstated the evidence. The values are renamed in place:
--   provider_reported_actual      → provider_usage_derived_estimate
--   conservative_estimate         → conservative_reservation_estimate
-- No data is dropped; NULL cost_basis stays NULL. Safe to re-run.
DO $$
BEGIN
  -- 1. Drop the legacy CHECK (if it still carries the old labels) FIRST so
  --    existing rows can be relabeled without violating it.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'paid_budget_reservations'::regclass
             AND conname = 'paid_budget_reservations_cost_basis_check'
             AND pg_get_constraintdef(oid) LIKE '%provider_reported_actual%') THEN
    ALTER TABLE paid_budget_reservations
      DROP CONSTRAINT paid_budget_reservations_cost_basis_check;
  END IF;
  -- 2. Relabel existing rows in place (no data dropped; NULL stays NULL).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'paid_budget_reservations' AND column_name = 'cost_basis') THEN
    UPDATE paid_budget_reservations SET cost_basis = 'provider_usage_derived_estimate'
      WHERE cost_basis = 'provider_reported_actual';
    UPDATE paid_budget_reservations SET cost_basis = 'conservative_reservation_estimate'
      WHERE cost_basis = 'conservative_estimate';
  END IF;
  -- 3. Add the corrected CHECK (idempotent: skipped when already current).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'paid_budget_reservations'::regclass
                 AND conname = 'paid_budget_reservations_cost_basis_check'
                 AND pg_get_constraintdef(oid) LIKE '%provider_usage_derived_estimate%') THEN
    ALTER TABLE paid_budget_reservations
      ADD CONSTRAINT paid_budget_reservations_cost_basis_check
      CHECK (cost_basis IS NULL OR cost_basis IN
        ('provider_usage_derived_estimate','conservative_reservation_estimate','provider_billed_actual'));
  END IF;
END $$;
