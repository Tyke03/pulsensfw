-- 0008_affiliate_registry_and_clicks.sql
-- Central affiliate program/link registry and privacy-preserving click logging
-- for the /go/<link-id> redirect engine.
--
-- No PII is stored in affiliate_clicks (no IPs, no user IDs, no cookies).
-- Access is service-role only: anon and authenticated roles have zero grants
-- and RLS stays enabled with zero public policies.

create table if not exists affiliate_programs (
  program_id text primary key,
  brand text not null,
  entity_slugs text[] not null default '{}',
  network text,
  program_url text,
  signup_status text not null check (signup_status in ('packet_sent', 'applied', 'pending', 'approved', 'rejected', 'no_program', 'needs_search')) default 'needs_search',
  commission text,
  cookie_days integer,
  payout_terms text,
  restrictions text,
  desks text[] not null default '{}',
  evidence jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_links (
  link_id text primary key,
  program_id text not null references affiliate_programs(program_id) on delete cascade,
  entity_slug text,
  scope text not null check (scope in ('home', 'product', 'bundle', 'landing', 'category', 'coupon')) default 'home',
  target text,
  tracked_url text not null,
  fallback_link_id text,
  match_keywords text[] not null default '{}',
  priority integer not null default 100,
  status text not null check (status in ('active', 'paused', 'dead')) default 'active',
  source text not null default 'brent',
  last_health jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_clicks (
  id bigserial primary key,
  link_id text not null,
  article_slug text,
  slot text,
  resolved_status text not null default 'active',
  clicked_at timestamptz not null default now()
);

create index if not exists affiliate_links_program_idx on affiliate_links (program_id, status, priority);
create index if not exists affiliate_links_entity_idx on affiliate_links (entity_slug, status);
create index if not exists affiliate_clicks_link_idx on affiliate_clicks (link_id, clicked_at desc);
create index if not exists affiliate_clicks_article_idx on affiliate_clicks (article_slug, clicked_at desc);

alter table affiliate_programs enable row level security;
alter table affiliate_links enable row level security;
alter table affiliate_clicks enable row level security;

revoke all on table affiliate_programs from anon, authenticated;
revoke all on table affiliate_links from anon, authenticated;
revoke all on table affiliate_clicks from anon, authenticated;

grant all on table affiliate_programs to service_role;
grant all on table affiliate_links to service_role;
grant all on table affiliate_clicks to service_role;
grant usage, select on sequence affiliate_clicks_id_seq to service_role;
