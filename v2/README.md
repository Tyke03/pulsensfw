# PulseNSFW v2

Phase 1 shell for [pulsensfw.com](https://pulsensfw.com). Tagline: **The NSFW internet, honestly reviewed.** The Express app at the repo root is untouched.

This desk is for people who watch: stars, sites, VR, games, AI, and sex tech, with search across the entity catalog. It is not a creator-business or industry desk.

Astro server-renders every page for Cloudflare Workers. Content is local MDX and JSON behind `getContentRepository()` so Supabase can replace that module later. Every fact about a star, site, or AI app lives in exactly one place: the entity file.

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

- Auth is **email magic link**: one-time Supabase link, no password stored on
  this site. `SUPABASE_SERVICE_ROLE_KEY` is server-only; the anon key is the
  only key that reaches a browser.
- `supabase/migrations/0001_reader_profiles.sql` creates `reader_profiles`,
  `saved_entities`, and `follows`, all behind RLS limited to the owner row.
  The server writes through the service role but always scopes by the
  `user_id` from the verified session — never from form input.
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
