# PulseNSFW v2

Phase 1 shell for [pulsensfw.com](https://pulsensfw.com). Tagline: **The NSFW internet, honestly reviewed.** The Express app at the repo root is untouched.

This desk is for people who watch: stars, sites, VR, games, AI, and sex tech, with search across the entity catalog. It is not a creator-business or industry desk.

Astro server-renders every page for Cloudflare Workers. Content is local MDX and JSON behind `getContentRepository()` with the agent-store overlay (Supabase Postgres when configured). Every fact about a star, site, or AI app lives in exactly one place: the entity file.

## Stack (2026-11-07 final)

This desk runs on **Supabase Postgres + Supabase Auth**, Astro SSR on
Cloudflare, R2 for media and Amazon SES for plain-text mail, with local
opencode agents + cron calling the site's MCP/HTTP endpoints. Project:
`pulsensfw` (ref `nlvirznczjtprsedrwnk`, us-east-1) — created, ACTIVE_HEALTHY,
nothing applied remotely yet.

Historical record: an interim (2026-11-06/07) replaced Supabase with Neon
Postgres; that interim was reverted — the Neon artifacts (`../neon.ts` at the
repo root, `.env.local` from the old CLI link, `v2/neon/migrations/`) are
preserved untouched as reference material and read by no tooling. What the
final stack looks like:

- Database/auth: Supabase (`supabase-js` + `@supabase/ssr`; auth is Supabase
  magic-link OTP). Sessions verified server-side (`lib/auth/supabase.ts`);
  reader isolation comes from RLS owner-only policies (0001) PLUS explicit
  `user_id` scoping in every server statement — never client input.
- Migrations: `v2/supabase/migrations/` 0001 → 0004 (0004 reconciles the
  interim round: hardened privileged function, defense-in-depth grants
  (revoke anon/authenticated on pipeline/usage tables), updated_at trigger,
  review comments). Held for owner approval; not applied remotely yet.
- Everything else (agents, Concierge, age seam, SES, R2, model ladder) is
  unchanged behavior-wise.

Node **22.23.4 or newer** is required (`engines` in `package.json`, version pinned in `.nvmrc`). Astro 7 refuses to start below that.

Vite is given an inline PostCSS config (`css.postcss.plugins: []`) so `npm run dev` does not load a parent `postcss.config.js`. Do not add a `postcss.config.*` file in this folder.

## Entities and articles

Structured data lives in `src/content/entities/` — one JSON file per entity (star, site, AI app, product, game), shaped by `src/lib/content/entity-schema.ts`. Articles live in `src/content/articles/` (MDX) and reference entities by slug via the `entities` frontmatter key; every claim about an entity must point back at its file.

External pipelines push content through a submission JSON checked against `src/schemas/submission.json`:

```bash
npm run ingest -- path/to/submission.json [--force]
```

The command creates new entities, merges partial entity updates (facts are merged by key, pricing deep-merged, image may be replaced or nulled), and writes exactly one MDX article per submission run (`--force` overwrites).

Facts carry provenance: `{ key, value, source_url, checked, evidence_type, notes }` where `evidence_type` is `first_party | community | hands_on | press | aggregator`. Unverified numbers are `null`, never guesses, and inclusion or rank never rests on aggregator evidence alone. Every entity carries `affiliate_status` (`active | needs_search | program_found_signup_queued | no_program`), optional program details in `affiliate`, and `monetization_methods[]`. Only `active` entities render affiliate links; affiliate status never affects score or rank. Programs awaiting signup are listed in `data/affiliate-queue.md`. Brand art and favicons came from the PulseNSFW Site Assets kit and live in `public/media/`; the mapping is documented in `public/media/brand/README.md`.

## Category art

Drop a section's header and default cover on top of the files already there:

- `public/media/categories/<id>/hero.svg` — wide header
- `public/media/categories/<id>/cover.svg` — fallback when an entry has no picture

`<id>` is `stars`, `sites`, `ai`, `toys`, `vr`, `guides`, `lists`, or `news`. Paths are listed in `src/lib/brand/slots.ts`. The P mark is `public/brand/mark.svg` (also `public/favicon.svg`). The wordmark is `public/brand/wordmark.svg`.

## Brand kit wiring

The owner kit (`PulseNSFW-Site-Assets`, 33 files) is fully mapped. Canon paths
live in `src/lib/brand/slots.ts` (`CATEGORY_ART` + `BRAND_ART`); kit-to-site
mapping is documented in `public/media/brand/README.md`:

- `favicon-32/1024.png`, `icon-192/512.png`, `apple-touch-icon.png`, `og-default.png` → `public/` root
- `chrome/app-icon|avatar|monogram-p.png` → `public/media/brand/app-icon|avatar|monogram-p.png` (1280×720 renders; the avatar is cropped to a ring by CSS)
- `01-hero-bg|04-empty-state|05-newsletter-cta|06-about-header|08-reviewer-badge|07-category-icons-grid.png` → `public/media/brand/<name>.png`
- `categories/*.png` (banners) → `public/media/categories/<id>/hero.png`, `thumbs/*.png` → `.../cover.png`, renamed `ai-chatbots`→`ai`, `sex-tech`→`toys`, `vr`, `industry-news`→`news`, `how-to`→`guides`, `rankings`→`lists`

To rebrand, replace the file at the same path — no code changes. The glossy
gradient P + chrome PULSE wordmark behavior stays in `Logo.astro` (NSFW mode
swaps to the hot-magenta NSFW wordmark; discreet mode swaps the favicon).

## Run locally

```bash
cd v2
nvm use
npm install
npm run dev
```

Open http://localhost:4321. The age gate is the first screen. Confirm you are 18+ to enter. SFW stays on until the NSFW switch.

```bash
npm test
npm run build
npm run preview
```

`npm run build` outputs a Cloudflare Worker. Do not deploy from this phase.

## Agent access (round 2E)

The site exposes an MCP endpoint plus a JSON HTTP API over the SAME service
layer (`src/lib/agent/`). Two server-only bearer keys (`AGENT_DRAFT_KEY`,
`AGENT_PUBLISH_KEY`) enforce per-operation scope: the drafts key handles
research/drafts/affiliate metadata, the publish key handles
publish/unpublish/rollback. Every mutation is idempotent (identical retries
replay the stored result; a reused key with different input fails loudly) and
drafts carry optimistic revision bases so concurrent edits fail instead of
overwriting. Publication writes overlay published content into the hybrid
content repository, so published changes appear on public pages, search and
compare. `v2/supabase/migrations/0002_agent_content.sql` (reconciled by
`0004_reconcile_fresh_baseline.sql`) carries the drafts, revisions, audit
trail and affiliate queue (append-only; service-role only).
Role prompts live in `docs/agents/roles.md` (scheduling stays a doc-only
example, never activated).

## Persona Concierge (round 2F)

`/concierge` mounts the MIT-licensed Persona widget over a server-enforced
tool allowlist (search/compare/read of PUBLISHED content only). Answers cite
real pages; the server validates citations and applies age/SFW filters to
retrieval — the dev stub never unlocks production NSFW. The shared model
ladder (`src/lib/models/`) routes prose calls through OneProvider tiers then
a Venice fallback, with narrow refusal detection separate from outages, and
per-session/daily/cost limits (migration 0003). Without model credentials the
 Concierge answers "unconfigured" honestly; `CONCIERGE_DEV_MOCK=1` is a
labeled dev-fixture mode for screenshots only.

## Launch readiness (round 2G)

`npm run launch:audit` prints the code-complete / mocked / needs-live table
without secrets; `docs/launch-readiness.md` carries the deployment,
migration, backup, cutover and rollback steps. Production activation remains
an owner decision.

## Reader controls

- NSFW switch: off until the age stub passes, then opt-in. Changing it reloads so the server can add or remove image URLs.
- Discreet mode: neutral tab title and plain favicon.
- Blur: blurs the page body and leaves the header usable.
- Quick hide: Shift+H toggles discreet mode and blur together.

## Search and compare (round 2C)

- `/search` is a plain form GET — it works with JavaScript off. With JS on,
  the header/home forms show live suggestions (`/api/search`, JSON), and the
  results page debounces the same GET and swaps the results region in place.
- Entity pages and result pages carry a Related row, ranked purely from the
  local catalog (same topic → tag overlap → same kind); ordering is
  deterministic so SSR HTML is stable.
- `/compare?ids=one,two,three` puts 2–4 entities of the same kind side by
  side: score, pricing summary, platforms, NSFW notes, last checked, pros and
  cons — all from entity records. Mixed kinds are rejected; missing facts
  render as `—` (nothing is invented). The URL is the share link.

## Reader accounts (round 2D)

- **Supabase Auth**: email magic-link OTP sessions (no password stored on
  this site); sessions verified server-side on every call
  (`lib/auth/supabase.ts`). `SUPABASE_SERVICE_ROLE_KEY` is server-only; the
  Anon key is the only key that reaches a browser. Unconfigured → the desk
  stays honestly guest-only until the owner wires the NEW project's keys.
- `v2/supabase/migrations/0001_reader_profiles.sql` creates `reader_profiles`,
  `saved_entities`, `follows` — RLS owner-only policies (0001) PLUS the
  server's verified-session `user_id` scoping on every statement (defense in
  depth; never client input). `0004` adds hardened function/trigger/grants
  for the new project.
- Signed-out readers keep cookie preferences. Signed-in readers get saves and
  follows on `/you`; the age/NSFW cookie remains the fast path for the gate.
- `/you` is the account desk: sign-in link, NSFW state, saved list, follows.

## Age verification vendor seam

Round 2D keeps `src/lib/age/provider.ts` as the seam. The built-in stub runs
unless **both** `AGE_VENDOR_API_URL` and `AGE_VENDOR_API_KEY` are set; then
`src/lib/age/vendor-provider.ts` posts the vendor token server-side and the
gate unlocks NSFW only on `AgeVerificationResult.ok`. No government IDs,
selfies, or card numbers are collected in Pulse forms — the vendor hosts
anything like that. Verified-age cookies are `stub.v1` or `vendor.v1*`.

## Newsletter and contact mail

`src/lib/mail/ses.ts` is the one shared mail path: minimal SigV4 over fetch
(no AWS SDK), plain text only. Subscribe (`/api/newsletter`) sends a single
plain-text confirmation; contact (`/api/contact`) mails the desk inbox when
`NEWS_TO` is set. Without SES env both endpoints answer "not configured"
honestly — no fake success.

No secrets belong in this folder. See `.env.example` for names and which are
server-only.
