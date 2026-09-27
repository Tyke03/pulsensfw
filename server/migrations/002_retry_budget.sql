-- 002_retry_budget.sql — raise the default per-item retry budget.
-- Rationale: the anonymous free-tier Pollinations endpoint intermittently
-- returns prose instead of JSON (~1 in 4 calls during observed windows).
-- With max_attempts=5, writer items could exhaust retries before ever
-- producing a draft; 12 attempts with exponential backoff (30s→30m cap)
-- rides out sustained flake windows. Purely additive / idempotent.
ALTER TABLE work_items ALTER COLUMN max_attempts SET DEFAULT 12;
