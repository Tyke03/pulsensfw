-- 0001_app_current_baseline.sql — Neon-compatible app schema
-- Stack correction 2026-11: full translation of the legacy Supabase-side
-- schema to plain Postgres for Neon. NOT APPLIED to any remote branch in
-- this round — the Neon CLI/Console apply step is an owner-approval action.
--
-- What changed vs the old Supabase migrations (kept as historical material
-- in ../supabase/migrations, never executed again):
--   • no RLS policies and no auth.uid() — the app's Neon connection is the
--     single server service key; reader-facing isolation is enforced in the
--     service layer by explicit user_id equality from a server-verified
--     Neon Auth session (lib/reader/store.ts, lib/agent/service.ts).
--   • no auth.users foreign keys: Neon Auth (Managed Better Auth) keeps its
--     users in the neon_auth schema managed by the service; relation to
--     reader rows is by user_id value only, because Neon Auth owns its
--     schema and lifecycle.
--   • Postgres-plain types only; views and upsert functions translate 1:1
--     where they existed.
--
-- Production driver: official @neondatabase/serverless over HTTP
--   (docs: https://neon.com/docs/serverless/serverless-driver — accessed
--   2026-11-07). Local tests: in-process Postgres via @electric-sql/pglite.

create table if not exists reader_profiles (
  user_id text primary key,
  nsfw_pref boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reader account extras: saved pages + follows (stars/sites/AI).
create table if not exists reader_saved (
  user_id text not null,
  slug text not null,
  kind text not null check (kind in ('star', 'site', 'ai', 'product', 'game')),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists reader_follows (
  user_id text not null,
  slug text not null,
  kind text not null check (kind in ('star', 'site', 'ai', 'product', 'game')),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create index if not exists reader_saved_user_idx on reader_saved (user_id);
create index if not exists reader_follows_user_idx on reader_follows (user_id);

-- ===== Agent content pipeline (ported from 0002_agent_content.sql) =====

create table if not exists agent_idempotency (
  key_id text primary key,
  scope text not null,
  request_hash text not null,
  outcome_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_drafts (
  slug text primary key,
  status text not null check (status in ('draft', 'in_review', 'published', 'rolled_back')),
  state jsonb not null,
  fingerprint text not null,
  revision_seq integer not null,
  revised_at timestamptz not null
);

create table if not exists agent_revisions (
  slug text not null,
  seq integer not null,
  status_at text not null check (status_at in ('draft', 'in_review', 'published', 'rolled_back')),
  state jsonb not null,
  note text not null default '',
  actor_print text not null,
  created_at timestamptz not null default now(),
  primary key (slug, seq)
);

create table if not exists agent_publications (
  slug text primary key,
  published boolean not null default false,
  version_seq integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists agent_affiliate_queue (
  reference bigserial primary key,
  slug text not null,
  status text not null check (status in ('active', 'needs_search', 'program_found_signup_queued', 'no_program')),
  patch jsonb not null,
  actor_print text not null,
  at timestamptz not null default now()
);

create table if not exists agent_audit (
  id bigserial primary key,
  action text not null check (action in ('draft-upsert', 'publish', 'unpublish', 'rollback', 'affiliate-upsert')),
  subject text not null,
  actor_print text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists agent_audit_subject_idx on agent_audit (subject);
create index if not exists agent_revisions_slug_idx on agent_revisions (slug, seq);
create index if not exists agent_affiliate_slug_idx on agent_affiliate_queue (slug);

-- Published overlay read model (unchanged semantics).
create or replace view agent_publications_view as
select p.slug, d.state, p.version_seq
from agent_publications p
join agent_drafts d on d.slug = p.slug and d.revision_seq = p.version_seq
where p.published;

-- ===== Model usage accounting (ported from 0003_model_usage.sql) =====

create table if not exists model_usage_daily (
  day date not null,
  session_hash text not null,
  model_id text not null,
  calls integer not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  est_cost_micro_usd bigint,
  primary key (day, session_hash, model_id)
);

create index if not exists model_usage_day_idx on model_usage_daily (day);
