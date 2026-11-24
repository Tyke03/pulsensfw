-- 0005_view_and_function_permissions.sql
-- Scoped migration-security fix (2026-11-08).
--
-- Closes two privilege gaps left by 0003/0004/0002, per current Supabase
-- guidance (docs/guides/database/functions — function privileges, and
-- docs/guides/database/row-level-security — views; both accessed 2026-11-08):
--
-- 1. bump_model_usage_daily is SECURITY DEFINER. Postgres grants EXECUTE on
--    every new function to PUBLIC by default, so 0004's role-specific
--    revokes (anon, authenticated) still left the public path open. Supabase
--    guidance: "revoke execute ... from `public` and from each role holding
--    a direct grant ... Then grant it to the roles that need it."
--
-- 2. agent_publications_view was created by 0002 without security_invoker.
--    Postgres executes views with their owner's privileges (postgres bypasses
--    RLS), so table-level revokes do not constrain the view, and Supabase's
--    default privileges grant new views to anon/authenticated/service_role.
--    Guidance: set `security_invoker = true` on views over protected tables
--    and revoke exposures down to the intended caller.
--
-- Intended callers here are server-only: the app's POSTGRES/Supabase service
-- client (POSTGRES service key server role). Reader RLS from 0001 and the
-- published-only repository overlay are untouched. Note on append-only: the
-- agent_revisions table is currently append-only by APPLICATION discipline,
-- not by database enforcement — the SQL regression test demonstrates the
-- service role can still UPDATE/DELETE, so no immutability claim is made
-- beyond that.
--
-- Applied behavior (asserted in src/lib/supabase/migrations.test.ts):
--   anon / authenticated: function call → 42501; view select → 42501
--   service_role: function call → ok; view select → ok

-- 1) Privileged function: close the PUBLIC default, the client roles, then
--    grant the intended server caller.
revoke execute on function public.bump_model_usage_daily(date, text, text, bigint, bigint, bigint) from public;
revoke execute on function public.bump_model_usage_daily(date, text, text, bigint, bigint, bigint) from anon;
revoke execute on function public.bump_model_usage_daily(date, text, text, bigint, bigint, bigint) from authenticated;
grant execute on function public.bump_model_usage_daily(date, text, text, bigint, bigint, bigint) to service_role;

-- 2) Published-overlay view: make invoker-privileged and close exposures.
alter view public.agent_publications_view set (security_invoker = true);
revoke all on public.agent_publications_view from public;
revoke all on public.agent_publications_view from anon;
revoke all on public.agent_publications_view from authenticated;
grant select on public.agent_publications_view to service_role;
