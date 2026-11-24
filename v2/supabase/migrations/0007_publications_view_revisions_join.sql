-- 0007_publications_view_revisions_join.sql
-- Published read model reads the pointer's own revision (2026-11-08 —
-- live incident from the idempotency verification round on this project).
--
-- LIVE EVIDENCE (project nlvirznczjtprsedrwnk, Rest/SQL probed 2026-11-08):
--   slug live-idem-c3c67f2673 had agent_publications published=true
--   version_seq=2 and an intact agent_revisions row at seq=2, yet
--   GET /story/live-idem-c3c67f2673 returned 404 and /search did not list
--   it. Cause: a later stale-CAS publish attempt (fresh idempotency key,
--   wrong expectedVersion → the documented 409) writes its audited attempt
--   revision (seq=3) AND advances the agent_drafts head to 3, while the
--   unchanged pointer stays at version_seq=2.
--
--   The 0002 view joined agent_drafts on d.revision_seq = p.version_seq,
--   i.e. it read the MUTABLE draft head. That equality breaks the moment
--   any post-publication revision exists (audit trail by design), so the
--   currently-published story vanished from the storefront — a rejected
--   request hiding live content.
--
-- Fix: the read model must be a function of the PUBLICATION, not the
-- draft head. Each agent_publications row pins version_seq; the published
-- bytes are the immutable agent_revisions row at (slug, seq). Attempt
-- revisions, later drafts and rollbacks may extend the trail freely; a
-- published pointer keeps serving exactly the version it names.
--
-- Posture is unchanged from 0005: security_invoker stays on, and only the
-- server-only service_role data path may read the view (re-asserted here
-- per file so a fresh apply cannot regress it).

create or replace view public.agent_publications_view as
select p.slug, r.state, p.version_seq
from public.agent_publications p
join public.agent_revisions r
  on r.slug = p.slug
 and r.seq = p.version_seq
where p.published;

alter view public.agent_publications_view set (security_invoker = true);
revoke all on public.agent_publications_view from public;
revoke all on public.agent_publications_view from anon;
revoke all on public.agent_publications_view from authenticated;
grant select on public.agent_publications_view to service_role;
