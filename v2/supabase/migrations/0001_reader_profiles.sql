-- 0001_reader_profiles.sql
-- Reader accounts for PulseNSFW v2 (round 2D).
--
-- One row per reader profile, plus child tables for saved entities and
-- follows (star / site / AI the reader follows). Every table carries RLS:
-- a signed-in user can only ever see and touch their own rows. The server
-- uses SUPABASE_SERVICE_ROLE_KEY for trusted writes and always scopes by the
-- authenticated user_id from the verified session — never from form input.
--
-- Signed-out readers keep cookie preferences; the profile mirrors NSFW pref
-- plus saved/follows once they sign in.

create table if not exists public.reader_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nsfw_pref boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_entities (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  kind text not null check (kind in ('star', 'site', 'ai', 'product', 'game')),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  kind text not null check (kind in ('star', 'site', 'ai', 'product', 'game')),
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create index if not exists saved_entities_user_idx on public.saved_entities (user_id);
create index if not exists follows_user_idx on public.follows (user_id);

alter table public.reader_profiles enable row level security;
alter table public.saved_entities enable row level security;
alter table public.follows enable row level security;

-- reader_profiles: strictly own row.
create policy "read own profile"
  on public.reader_profiles for select
  using (auth.uid() = user_id);

create policy "insert own profile"
  on public.reader_profiles for insert
  with check (auth.uid() = user_id);

create policy "update own profile"
  on public.reader_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- saved_entities / follows: strictly own rows on every carrier of the data.
create policy "read own saved"
  on public.saved_entities for select
  using (auth.uid() = user_id);

create policy "insert own saved"
  on public.saved_entities for insert
  with check (auth.uid() = user_id);

create policy "delete own saved"
  on public.saved_entities for delete
  using (auth.uid() = user_id);

create policy "read own follows"
  on public.follows for select
  using (auth.uid() = user_id);

create policy "insert own follows"
  on public.follows for insert
  with check (auth.uid() = user_id);

create policy "delete own follows"
  on public.follows for delete
  using (auth.uid() = user_id);

-- Cleanup when a reader account is deleted lives in the FK cascade above.
