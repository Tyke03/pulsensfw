-- 005_ladder_tiers.sql — widen the agent_runs tier CHECK for the
-- two-provider ladder (2026-10-13).
--
-- Why: model-ladder.ts now serves 'cheap' (Pollinations base rung) and
-- 'op_tier1' / 'op_tier2' (OneProvider fallback gateway). Migration 004 added
-- agent_runs_tier_allowed pinning tier labels to the original three-value
-- ladder, so any run recorded at a new tier is rejected — observed live as
-- work items dying between research-material gather and the model call (the
-- exception propagated out of runAgent's recordRun, unlogged in 2026-10-13
-- prod). paid_budget_reservations has NO tier-value CHECK (verified against
-- the production schema), so the ledger is unaffected.
--
-- Non-destructive: drops only the named constraint and re-adds a widened one.
-- Idempotent: safe to run repeatedly.
--
-- ROLLBACK: git revert + redeploy reverts code; this schema widening is
-- backward-compatible with the pre-ladder code (old labels remain valid), so
-- no down-migration is required.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_tier_allowed') THEN
    ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_tier_allowed;
  END IF;
  ALTER TABLE agent_runs
    ADD CONSTRAINT agent_runs_tier_allowed
    CHECK (tier IN ('free','cheap','paid_tier1','paid_tier2','op_tier1','op_tier2'));
END $$;
