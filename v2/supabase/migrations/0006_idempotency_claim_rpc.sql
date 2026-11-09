-- 0006_idempotency_claim_rpc.sql
-- Idempotency claim/outcome RPCs (2026-11-08 — fix for the live
-- reproduction on slug setup-sfw-e969e730a587, publish key
-- setup-sfw-e969e730a587-pub: identical-key retry through the HTTP
-- transport with a changed expectedVersion executed a new publication
-- revision instead of 409ing or replaying, while the idempotency record
-- held the original outcome).
--
-- Root causes addressed:
--   • the claim used a two-step non-atomic PostgREST upsert(+re-read) whose
--     conflict resolution can rewrite the stored request_hash under
--     library/PostgREST drift — reclassifying a changed-input retry as
--     "free" — and every write also ran BEFORE the claim (audit). Fixed on
--     both sides: the claim/outcome now run as single SECURITY DEFINER SQL
--     statements (INSERT ... ON CONFLICT (key_id) DO NOTHING can never
--     rewrite a stored hash; outcome update is pinned to key+hash+scope),
--     and the service layer claims FIRST — no audit/revision/publication
--     mutation happens before the classification returns.
--   • classification (stored replay / 409 conflict-current for changed
--     input / 409 conflict-inflight for racing identical retries) is now
--     evaluated inside the SQL statement — one round trip, race-free,
--     identical for both MCP and HTTP because the service layer is shared.
--
-- Required migration on the target project BEFORE agent publishing resumes:
-- the store route fails closed (honest 503 "agent-store-unavailable") until
-- this function exists. NOT applied remotely in this round.
--
-- Grants follow Supabase guidance for privileged functions (security
-- definer: pinned search_path, no PUBLIC/default execute, service_role only).
--
-- RESULT CONTRACT (added after live verification 2026-11-08): exactly ONE
-- row, always. In PL/pgSQL `return query` appends and CONTINUES executing —
-- so every classification branch ends with `return;`; the trailing
-- unconditional `return query conflict-inflight` must not fire twice. The
-- first live probe (pre-fix) returned trailing junk rows
-- ([free, conflict-inflight], [stored, ...]); the store reads row 0 only,
-- but the surface contract is one row, asserted by the SQL tests.

create or replace function public.agent_claim_idempotency(
  p_key text,
  p_scope text,
  p_hash text
)
returns table (claim_status text, outcome jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agent_idempotency%rowtype;
begin
  -- Single winner per key: ON CONFLICT DO NOTHING never touches an existing
  -- row (that is the fix — no stored-hash rewriting from the claim path).
  insert into public.agent_idempotency (key_id, scope, request_hash)
  values (p_key, p_scope, p_hash)
  on conflict (key_id) do nothing
  returning * into v_row;

  if found then
    return query select 'free'::text, null::jsonb;
    return;
  end if;

  select * into v_row from public.agent_idempotency where key_id = p_key;
  if not found then
    -- Cannot happen against the unique key; defensive classification says
    -- nothing about the caller's request.
    return query select 'conflict-inflight'::text, null::jsonb;
    return;
  end if;

  -- Same key + changed payload (or changed credential scope) is a hard
  -- conflict, reported without any mutation elsewhere.
  if v_row.scope is distinct from p_scope or v_row.request_hash is distinct from p_hash then
    return query select 'conflict-current'::text, null::jsonb;
    return;
  end if;

  -- Identical retry: the original outcome exists untouched.
  if v_row.outcome_json is not null then
    return query select 'stored'::text, v_row.outcome_json;
    return;
  end if;

  return query select 'conflict-inflight'::text, null::jsonb;
end;
$$;

create or replace function public.agent_store_idempotent_outcome(
  p_key text,
  p_scope text,
  p_hash text,
  p_outcome jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  -- Pinned to the exact key+scope+hash that won the claim: an outcome can
  -- never attach to a different request's record.
  update public.agent_idempotency
  set outcome_json = p_outcome
  where key_id = p_key and scope = p_scope and request_hash = p_hash;
$$;

revoke all on function public.agent_claim_idempotency(text, text, text) from public, anon, authenticated;
revoke all on function public.agent_store_idempotent_outcome(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.agent_claim_idempotency(text, text, text) to service_role;
grant execute on function public.agent_store_idempotent_outcome(text, text, text, jsonb) to service_role;
