-- 003_model_ladder.sql — cost/quality ladder accounting.
-- agent_runs gains the tier the run executed at and its actual/estimated USD
-- cost, so escalation policy and budget guards are data-driven. Purely
-- additive / idempotent.
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_agent_runs_tier_created ON agent_runs (tier, created_at);
