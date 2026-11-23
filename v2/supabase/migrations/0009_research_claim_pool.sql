-- 0009_research_claim_pool.sql
-- Reusable N:1 research claim corpus with category-based volatility TTLs.
--
-- Multiple research runs deposit discrete sourced claims here; writers
-- cherry-pick fresh snippets across runs/entities to build richly cited
-- articles, while volatile claims (pricing, community sentiment, features)
-- expire faster than static facts.
--
-- Service-role only (RLS closed, zero public policies).

create table if not exists research_claims (
  claim_id text primary key,
  desk text not null,
  entity_slug text,
  category text not null check (category in ('pricing', 'community', 'features', 'policy', 'static')),
  claim_key text not null,
  claim_value text not null,
  source_url text not null,
  evidence_type text not null check (evidence_type in ('first_party', 'community', 'hands_on', 'press', 'aggregator')),
  tags text[] not null default '{}',
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  notes text
);

create index if not exists research_claims_fresh_idx on research_claims (desk, expires_at desc);
create index if not exists research_claims_entity_idx on research_claims (entity_slug, expires_at desc);

alter table research_claims enable row level security;
revoke all on table research_claims from anon, authenticated;
grant all on table research_claims to service_role;
