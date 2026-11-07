-- 0002_agent_content.sql
-- External-agent content pipeline (round 2E).
--
-- Sources of truth (documented policy):
--   • Astro local content collections remain the seeded fixtures (dev).
--   • agent_drafts/agent_revisions are the publication layer when the QC key
--     publishes. The hybrid repository (lib/content/hybrid-repository.ts)
--     overlays PUBLISHED states only — drafts, revisions and research stay
--     invisible to public reads.
--   • agent_revisions is append-only: publish/unpublish/rollback add
--     revisions; history is never erased.
--
-- No anon policies: these tables carry pipeline data and credentials news —
-- access is service-role only (RLS fully closed, zero policies). The agent
-- service always scopes writes by the verified key fingerprint.

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

-- Published view for the hybrid content repository (published states only).
create or replace view agent_publications_view as
select p.slug, d.state, p.version_seq
from agent_publications p
join agent_drafts d on d.slug = p.slug and d.revision_seq = p.version_seq
where p.published;

alter table agent_idempotency enable row level security;
alter table agent_drafts enable row level security;
alter table agent_revisions enable row level security;
alter table agent_publications enable row level security;
alter table agent_affiliate_queue enable row level security;
alter table agent_audit enable row level security;
-- No policies: pipeline tables are service-role only. agent_publications_view
-- is a view (RLS of its base tables applies to queries through it).
