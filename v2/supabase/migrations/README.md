# migrations — Supabase (project `pulsensfw`, ref `nlvirznczjtprsedrwnk`)

Order for the new dedicated project (NOT applied remotely as of the
2026-11-07 round — owner-approval step; a dedicated dev branch/preview is
the recommended first target):

1. `0001_reader_profiles.sql` — reader tables + RLS owner-only policies
   (legacy Supabase Auth `auth.users` FK + `auth.uid()` policies: this is
   the Supabase-native pattern, correct again here)
2. `0002_agent_content.sql` — agent pipeline: idempotency (transactional
   unique key), append-only revisions, publications pointer,
   affiliate queue, audit trail, published-content view
3. `0003_model_usage.sql` — daily usage accounting + the
   `bump_model_usage_daily` upsert function (superseded by the hardened
   version in 0004)
4. `0004_reconcile_fresh_baseline.sql` — follow-up that reconciles the
   2026-11 round: privileged-function hardening (security definer, pinned
   search_path), defense-in-depth grants (no direct anon/authenticated
   access to pipeline/usage tables beneath RLS), reader_profiles.updated_at
   trigger, review comments
5. `0005_view_and_function_permissions.sql` — security fix closing two
   review findings: (a) default PUBLIC EXECUTE on the SECURITY DEFINER
   `bump_model_usage_daily` revoked from PUBLIC/anon/authenticated, granted
   to service_role only; (b) `agent_publications_view` set
   `security_invoker = true` (views bypass underlying RLS by default) with
   its anon/authenticated exposures revoked and service_role SELECT granted.
   Reader RLS and the published-only overlay are untouched; the regression
   tests below assert both denials and the service-role path via real SQL
   role switches.
6. `0006_idempotency_claim_rpc.sql` — atomic idempotency claim/outcome RPCs
   for the agent pipeline (`agent_claim_idempotency` → free / stored /
   conflict-current / conflict-inflight in ONE statement;
   `agent_store_idempotent_outcome` pinned to the winning key+scope+hash).
   Fixes the live repro on slug `setup-sfw-e969e730a587`: the previous
   two-step PostgREST upsert(+re-read) claim could let a reused key with
   changed input run through as "free". `INSERT ... ON CONFLICT (key_id) DO
   NOTHING` never rewrites a stored row, and the service layer now claims
   FIRST — no publication, revision or audit mutation happens before the
   classification. Required BEFORE agent publishing resumes on the target
   project; the app fails closed (503 agent-store-unavailable) until the
   RPCs exist.

History note: these same filenames were rehearsed during the round 2E–2G
implementation; the 2026-11-06/07 interim used Neon Postgres (kept in
`../neon/` as historical material — no Neon runtime remains in the app).
Apply with the Supabase CLI (`supabase db push`) or the SQL editor after an
owner review; the launch audit rows in `scripts/launch-audit.ts` mark this
as the live-verification step.
