# PulseNSFW v2

Phase 1 shell for [pulsensfw.com](https://pulsensfw.com). Tagline: **The NSFW internet, honestly reviewed.** The Express app at the repo root is untouched.

This desk is for people who watch: stars, sites, VR, games, AI, and sex tech, with search across the example catalog. It is not a creator-business or industry desk.

Astro server-renders every page for Cloudflare Workers. Content is local MDX and JSON behind `getContentRepository()` so Supabase can replace that module later. Explicit images are served from `/media/explicit/[id]` only when the age stub has passed and NSFW mode is on. SFW HTML does not include those URLs. Every article has an SFW cover. Explicit stills are optional extras.

Node **22.23.4 or newer** is required (`engines` in `package.json`, version pinned in `.nvmrc`). Astro 7 refuses to start below that.

Vite is given an inline PostCSS config (`css.postcss.plugins: []`) so `npm run dev` does not load a parent `postcss.config.js`. Do not add a `postcss.config.*` file in this folder.

## Category art

Drop a section's header and default cover on top of the files already there:

- `public/media/categories/<id>/hero.svg` — wide header
- `public/media/categories/<id>/cover.svg` — fallback when an entry has no picture

`<id>` is `stars`, `sites`, `ai`, `toys`, `vr`, `guides`, `lists`, or `news`. Paths are listed in `src/lib/brand/slots.ts`. The P mark is `public/brand/mark.svg` (also `public/favicon.svg`). The wordmark is `public/brand/wordmark.svg`.

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

No secrets belong in this folder. See `.env.example` for names that later phases will use.
