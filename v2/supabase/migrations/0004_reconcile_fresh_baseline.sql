-- 0004_reconcile_fresh_baseline.sql
-- Follow-up migration (round: stack re-correction 2026-11-07).
--
-- Background: 0001–0003 were rehearsed on the earlier implementation
-- iteration(s). This follow-up reconciles the 2026-11 round's improvements so
-- the NEW dedicated project (pulsensfw / nlvirznczjtprsedrwnk) can apply
-- 0001 → 0002 → 0003 → 0004 in order and land in the final intended state:
--
--   • agent pipeline tables closed to the service key (no direct anon or
--     authenticated grants — defense in depth beneath RLS and beyond it:
--     service key bypasses RLS, so Postgres-level grants are the only line
--     here);
--   • reader tables keep their RLS owner-only policies from 0001, plus the
--     service-key path for the server (service role bypasses RLS anyway);
--   • updated_at trigger on reader_profiles so the column moves even when a
--     writer forgets to set it (the Neon baseline relied on the app writing
--     it explicitly; the trigger makes the schema self-consistent);
--   • hardened privileged helper (0003's bump_model_usage_daily): pinned
--     search_path + SECURITY DEFINER review note;
--   • agent_affiliate_queue index naming and audit index already exist from
--     0002; nothing to backport there.
--
-- NOTHING in this file is applied remotely in this round. The Neon-round
-- schema (v2/neon/migrations, retained as historical material) differs only
-- in that it had no RLS/roles: the Supabase style here is authoritative
-- again.

-- 1) Privileged function hardening from 0003.
create or replace function public.bump_model_usage_daily(
  p_day date,
  p_session text,
  p_model text,
  p_prompt bigint,
  p_completion bigint,
  p_cost_micro bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.model_usage_daily (day, session_hash, model_id, calls, prompt_tokens, completion_tokens, est_cost_micro_usd)
  values (p_day, p_session, p_model, 1, p_prompt, p_completion, p_cost_micro)
  on conflict (day, session_hash, model_id) do update set
    calls = model_usage_daily.calls + 1,
    prompt_tokens = model_usage_daily.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = model_usage_daily.completion_tokens + excluded.completion_tokens,
    est_cost_micro_usd = case
      when excluded.est_cost_micro_usd is null then model_usage_daily.est_cost_micro_usd
      else coalesce(model_usage_daily.est_cost_micro_usd, 0) + excluded.est_cost_micro_usd
    end;
$$;

revoke all on function public.bump_model_usage_daily(date, text, text, bigint, bigint, bigint) from anon, authenticated;

-- 2) Defense in depth: no direct anon/authenticated access to pipeline and
--    usage tables. The server talks through the service key (bypasses RLS);
--    RLS below follows 0001/0002.
revoke all on public.agent_idempotency from anon, authenticated;
revoke all on public.agent_drafts from anon, authenticated;
revoke all on public.agent_revisions from anon, authenticated;
revoke all on public.agent_publications from anon, authenticated;
revoke all on public.agent_affiliate_queue from anon, authenticated;
revoke all on public.agent_audit from anon, authenticated;
revoke all on public.model_usage_daily from anon, authenticated;

-- 3) reader_profiles.updated_at keeps itself current.
create or replace function public.touch_reader_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reader_profiles_touch on public.reader_profiles;
create trigger reader_profiles_touch
  before update on public.reader_profiles
  for each row execute function public.touch_reader_profile();

-- 4) Explicit review notes for the launch audit (no-ops on purpose):
comment on table public.agent_audit is
  'Append-only agent audit trail (draft-upsert/publish/unpublish/rollback/affiliate-upsert). No update/delete policies by design.';
comment on table public.reader_profiles is
  'Per-reader NSFW preference. RLS: owner rows only (0001). Scope in the service layer comes from the verified Supabase session, never client input.';
