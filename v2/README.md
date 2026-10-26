# PulseNSFW v2

Phase 1 shell for [pulsensfw.com](https://pulsensfw.com). The Express app at the repo root is untouched.

Astro server-renders every page for Cloudflare Workers. Content is local MDX and JSON behind `getContentRepository()` so Supabase can replace that module later. Explicit images are served from `/media/explicit/[id]` only when the age stub has passed and NSFW mode is on. SFW HTML does not include those URLs.

## Run locally

```bash
cd v2
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
