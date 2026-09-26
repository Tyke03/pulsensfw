-- 001_agent_fleet.sql — Agent Fleet & Orchestrator (rebuild v3)
-- Additive-only migration. No legacy table is altered destructively.
--
-- ROLLBACK NOTES (safe because all objects are new):
--   DROP TABLE IF EXISTS orchestration_events, publish_decisions,
--     affiliate_health_checks, end_rail_plans, media_assets,
--     review_escalations, agent_leases, agent_runs, work_items CASCADE;
--   The agent_instructions block below is CREATE TABLE IF NOT EXISTS: on the
--   live Neon database the table already exists and matches these columns, so
--   this block is a no-op there; on fresh environments it provisions the
--   canonical operator-command table with the same shape.
--   Nothing in this migration touches posts, affiliates, research files,
--   admin_tokens, site_config, or analytics.

-- ── Canonical operator-command channel (defensive DDL; no-op on live Neon) ──
CREATE TABLE IF NOT EXISTS agent_instructions (
  id           SERIAL PRIMARY KEY,
  target       VARCHAR(60)  NOT NULL,
  instruction  TEXT         NOT NULL,
  persist      BOOLEAN      NOT NULL DEFAULT FALSE,
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  consumed_by  JSONB        NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by   TEXT         NOT NULL DEFAULT 'brent-manual'
);

-- ── Work items (normalized work/state; queue isolation for backfill) ───────
CREATE TABLE IF NOT EXISTS work_items (
  id                 SERIAL PRIMARY KEY,
  idempotency_key    TEXT NOT NULL UNIQUE,
  queue              VARCHAR(20)  NOT NULL DEFAULT 'daily',
  type               VARCHAR(30)  NOT NULL,
  role               VARCHAR(60)  NOT NULL,
  category           VARCHAR(50),
  priority           INTEGER      NOT NULL DEFAULT 5,
  state              VARCHAR(40)  NOT NULL DEFAULT 'discovered',
  source_ref         TEXT,
  source_payload     JSONB,
  context            JSONB,
  transition_history JSONB        NOT NULL DEFAULT '[]',
  attempt_count      INTEGER      NOT NULL DEFAULT 0,
  max_attempts       INTEGER      NOT NULL DEFAULT 5,
  backoff_until      TIMESTAMPTZ,
  last_error         JSONB,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_items_state   ON work_items (state);
CREATE INDEX IF NOT EXISTS idx_work_items_queue   ON work_items (queue);
CREATE INDEX IF NOT EXISTS idx_work_items_role    ON work_items (role, state);
CREATE INDEX IF NOT EXISTS idx_work_items_backoff ON work_items (backoff_until);

-- ── Agent runs (prompt/version/model provenance, hashed I/O) ───────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id             SERIAL PRIMARY KEY,
  work_item_id   INTEGER REFERENCES work_items(id),
  role           VARCHAR(60) NOT NULL,
  prompt_id      TEXT        NOT NULL,
  prompt_version TEXT        NOT NULL,
  model          TEXT,
  provider       TEXT,
  mode           VARCHAR(20) NOT NULL DEFAULT 'production',
  input_hash     TEXT,
  output_hash    TEXT,
  output         JSONB,
  status         VARCHAR(30) NOT NULL,
  error          TEXT,
  duration_ms    INTEGER,
  attempt        INTEGER     NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_item ON agent_runs (work_item_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_role ON agent_runs (role, created_at);

-- ── Leases (single owner per work item; expiry & recovery) ─────────────────
CREATE TABLE IF NOT EXISTS agent_leases (id SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id),
  lease_key    TEXT        NOT NULL,
  attempt      INTEGER     NOT NULL DEFAULT 1,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  released_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_leases_item ON agent_leases (work_item_id);

-- ── Review escalations (human-review queue) ────────────────────────────────
CREATE TABLE IF NOT EXISTS review_escalations (
  id               SERIAL PRIMARY KEY,
  work_item_id     INTEGER REFERENCES work_items(id),
  role             VARCHAR(60) NOT NULL,
  reason_code      VARCHAR(60) NOT NULL,
  detail           JSONB,
  status           VARCHAR(20) NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_review_escalations_status ON review_escalations (status);

-- ── Media assets (typed visual contract) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id                              SERIAL PRIMARY KEY,
  work_item_id                    INTEGER REFERENCES work_items(id),
  post_id                         INTEGER REFERENCES posts(id),
  asset_source        VARCHAR(40) NOT NULL,
  asset_url_or_object_key         TEXT,
  alt_text                        TEXT,
  caption                         TEXT,
  attribution                     TEXT,
  content_safety_classification   TEXT,
  rights_licensing_status         TEXT,
  generation_prompt_or_provenance TEXT,
  crop_or_focal_point             JSONB,
  status              VARCHAR(20) NOT NULL DEFAULT 'proposed',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_assets_item ON media_assets (work_item_id);

-- ── End-rail plans (selection + validation evidence) ───────────────────────
CREATE TABLE IF NOT EXISTS end_rail_plans (
  id                          SERIAL PRIMARY KEY,
  work_item_id                INTEGER REFERENCES work_items(id),
  post_id                     INTEGER REFERENCES posts(id),
  related_post_ids            JSONB NOT NULL DEFAULT '[]',
  related_post_slugs          JSONB NOT NULL DEFAULT '[]',
  affiliate_registry_id       INTEGER REFERENCES affiliates(id),
  affiliate_resolution_reason TEXT,
  fallback_mode   VARCHAR(20) NOT NULL DEFAULT 'internal_only',
  disclosure_text             TEXT,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  validation_detail           JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_end_rail_plans_item ON end_rail_plans (work_item_id);

-- ── Affiliate health checks (eligibility evidence) ─────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_health_checks (
  id             SERIAL PRIMARY KEY,
  affiliate_id   INTEGER REFERENCES affiliates(id),
  url            TEXT        NOT NULL,
  status         VARCHAR(40) NOT NULL,
  http_status    INTEGER,
  redirect_target TEXT,
  checker_run_id INTEGER,
  notes          TEXT,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_health_aff ON affiliate_health_checks (affiliate_id, checked_at);

-- ── Publish decisions (authorization evidence + idempotency) ───────────────
CREATE TABLE IF NOT EXISTS publish_decisions (
  id               SERIAL PRIMARY KEY,
  work_item_id     INTEGER REFERENCES work_items(id),
  post_id          INTEGER REFERENCES posts(id),
  decision         VARCHAR(20) NOT NULL,
  qc_recommendation VARCHAR(20),
  gates            JSONB,
  idempotency_key  TEXT        NOT NULL UNIQUE,
  actor            TEXT        NOT NULL DEFAULT 'orchestrator',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Orchestration events (audit ledger / side-effect journal) ──────────────
CREATE TABLE IF NOT EXISTS orchestration_events (
  id          SERIAL PRIMARY KEY,
  work_item_id INTEGER REFERENCES work_items(id),
  run_id       INTEGER REFERENCES agent_runs(id),
  type        VARCHAR(60) NOT NULL,
  mode        VARCHAR(20) NOT NULL DEFAULT 'production',
  actor       TEXT        NOT NULL DEFAULT 'orchestrator',
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orchestration_events_item ON orchestration_events (work_item_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_events_type ON orchestration_events (type, created_at);
