# Launch readiness (round 2G) — checkpoint, not cutover

Status line: **code complete for all surfaces; live verification pending for
everything that needs owner credentials.** No production deploy, DNS change,
merge, affiliate activation, or real email happened in this round.

## 1. What is where

| Surface | State | Needs for live |
|---|---|---|
| Content pages / search / compare / related | code complete (fixtures) | — |
| Accounts / saves / follows (Neon Auth + Neon Postgres) | code complete + unit tests (mock auth + pglite SQL) | enable Neon Auth in console + NEON_DATABASE_URL + 0001 baseline applied |
| Agent drafts/publish/rollback | code complete + tests (pglite + memory) | Neon Postgres env + agent keys + baseline applied |
| MCP endpoint | code complete (official SDK transport, stateless JSON) | agent keys |
| HTTP API parity | code complete | agent keys |
| Concierge (Persona widget + ladder) | code complete + tests (mock path) | MODELS_* keys (+ optional dev fixture for screenshots) |
| Age gate | code complete; vendor adapter behind env | AGE_VENDOR_* |
| SES mail | code complete; SigV4 verified unit-level vs AWS official vector | MAIL_* |
| R2 media sink | code complete behind `MEDIA_R2` binding | R2 bucket/bindings |

Run `npm run launch:audit` for the current table (no secrets printed).

## 2. Production content rules (checked into the audit)

- **Fixture exclusion:** seeded sample content lives under license `example`
  in `src/content/**` and is listed by the audit. Exclude those entites and
  sample articles from production by either (a) seeding the production
  catalog from the agent store only, or (b) a content-collection filter
  gated by `import.meta.env.PROD` — pick (b) at cutover time in
  `content.config.ts`. Nothing fabricated ships silently: search/compare
  read through the same repository as pages (round 2C-addendum tests).
- **Scores/prices:** no scraped ratings; every displayed number comes from
  entity JSON; missing values are dashes. The writer prompt forbids
  invented numbers (docs/agents/roles.md).
- **Media:** covers SFW by construction; explicit stills go through the
  explicit catalog keys, gated server-side by verified age + NSFW, and
  uploads require a 2257 reference when explicit (lib/media/r2-sink.ts).

## 3. Canonical / indexing / redirects

- Canonicals: emitted per page in BaseLayout from `Astro.site`.
- sitemap.xml: dynamic from the repository (includes published agent posts
  overlay).
- robots.txt: allow desk; disallow `/api/*`, `/you`, `/concierge`; sitemap
  line at production domain.
- Preview noindex: `/search`, `/you`, `/concierge`, `/contact`, 404 pages
  render `<meta name="robots" content="noindex">`.
- Redirects: Worker `_redirects` accepts map at cutover: old `/stars-*`
  aliases → new `/stars/:id` (list produced by launch-audit at deploy time;
  activate only with IDs that exist in the production catalog).
- Noindex preview builds: staging URLs get `noindex` via BaseLayout flag —
  verify with `curl -sI` + body grep against the preview domain before DNS
  cut.

## 4. Affiliate rules (unchanged + enforced)

- Links render ONLY for `affiliate_status === 'active'` entities, with
  `rel="sponsored noopener noreferrer"` and the "sponsored" label; everything
  else is a plain outbound link or no link at all. Placement code:
  EntityDataPanel + StarProfile (`round 2G added the StarProfile match`).
- Disclosures: `/affiliate-disclosure` page exists; rank rows label affiliate
  links; affiliate status never affects score, rank, or related ordering.
- Nothing invented: unverified programs queue via the agent affiliate
  pipeline with `needs_search` / `no_program`; the queue is owner-reviewed
  data, not auto-activation.

## 5. Deployment steps (owner-run; nothing executed this round)

1. **Neon Postgres + Auth (owner approval needed for enablement):** in the
   Neon console create (or reuse) project `steep-field-24680180`, use a
   **dev branch first** (`neon branches create`), apply
   `v2/neon/migrations/0001_app_current_baseline.sql` via psql/Neon SQL
   editor, enable **Better Auth** (Branch → Auth → Enable; sets the
   `auth: true` flag in the root neon.ts config — that approval also flips
   deployment state), then copy the Auth URL. Store server-only variables
   with Wrangler secrets (`NEON_DATABASE_URL`, `NEON_AUTH_BASE_URL`,
   `NEON_AUTH_COOKIE_SECRET`, and all other .env.example names marked
   server-only). Root `.env.local` comes from the Neon CLI link — never
   commit or overwrite it.
2. **Age vendor:** provision account; put `AGE_VENDOR_API_URL` + key. Local
   dev keeps the stub automatically when unset.
3. **Models:** pick prose model ids from the OFFICIAL catalogs only
   (OneProvider: https://oneprovider.dev/docs/api/models — accessed
   2026-11-06; Venice: https://docs.venice.ai/models/overview — accessed
   2026-11-06). Configure `MODELS_*`; the site disables unknown IDs at
   runtime and reports them.
4. **SES:** verify sender domain, create IAM key with `ses:SendEmail`, put
   MAIL_* vars; run one manual test via contact page (test send: use your
   own address; do not trigger welcome blasts while testing).
5. **R2:** create bucket; add `[r2_buckets]` binding `MEDIA_R2` in
   wrangler config; secrets for tokens listed in .env.example.
6. **Build:** `npm run build` → `wrangler deploy --dry-run` first; confirm
   `_routes.json` includes API routes; then real deploy.
7. **Post-deploy smoke list (owner):** gate first, /you sign-in flow, one
   draft→publish→visible loop through MCP, Concierge citation turn, contact
   mail, sitemap/robots 200s, canonical URLs, noindex on /you.

## 6. Backups + rollback

- Neon Postgres: enable point-in-time restore on the production project
  before go-live (plan feature); nightly logical dump to R2 optional via
  owner cron on their machine.
- Worker rollback: `wrangler rollback <deployment-id>` returns to the prior
  bundle; content rollback is data-level (agent store revisions) —
  `rollback` tool + `unpublish` never erase history.
- DNS should point at the Worker AFTER the smoke list passes, so a bad cut
  never reaches readers. Previous hosts stay up until the cut.

## 7. Rollout checklist (Do, in order)

1. Migrations applied (0001–0003).
2. Wrangler secrets set; `wrangler deploy` to a preview URL first.
3. Preview noindex verified.
4. Fixture-content exclusion configured for prod build (§2 rule (b)).
5. Age vendor live check passes with the vendor's own page; stub path never
   unlocks NSFW on production (server checks cookie issuer prefix).
6. SES verified + one manual email to the owner's own inbox — no list sends.
7. Affiliate statuses reviewed — untouched until activated by owner (round 3
   rule).
8. DNS cut; real `/you` sign-in; RLS spot check with two readers (PR comment
   lists commands).
9. Keep the memory store OFF in production (`AGENT_DEV_STORE` unset).

## 8. What must stay honest at launch

- No invented ratings, prices, or user counts anywhere (grep the audit).
- Concierge without credentials shows 'unconfigured'; with them exhausts
  quota honestly; never fabricates answers.
- Unavailable states label themselves (they are facts, not failures to hide).
- Development fixtures and mock ladders are visibly labeled in dev and
  excluded from production by config, not by trust.
