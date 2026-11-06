# PulseNSFW brand kit

Copied from `PulseNSFW-Site-Assets` (owner-owned brand kit) on 2026-10-26.

| File | Use |
|---|---|
| `hero-bg.png` | Homepage hero background |
| `empty-state.png` | Empty category / no-results art |
| `newsletter-cta.png` | Newsletter strip |
| `reviewer-badge.png` | Reviewed-by badge on score-bearing reviews |
| `about-header.png` | About page header |
| `category-icons-grid.png` | Reference sheet for category icons |
| `app-icon.png` | App-icon render (neon goggles plate) from `chrome/` |
| `avatar.png` | Reviewer avatar (chrome headset in magenta ring) from `chrome/` |
| `monogram-p.png` | Glossy gradient "P" monogram from `chrome/` |

The three `chrome/` files arrive as 1280×720 renders; components crop them with
`object-fit: cover` (avatar ring) rather than shipping their own formats.
Canonical paths are also listed in `src/lib/brand/slots.ts` (`BRAND_ART`).

## Legacy category map

| Old category asset | New nav |
|---|---|
| `ai-chatbots` | AI (`/ai`) |
| `sex-tech` | Toys & Tech (`/toys`) |
| `vr` | VR & Games (`/vr`) |
| `industry-news` | News (`/news`) |
| `how-to` | Guides (`/guides`) |
| `rankings` | Top Lists (`/lists`) |

The mapped banner and thumb live at `public/media/categories/<new-id>/hero.png` and `cover.png`.
Stars and Sites still use the original SVG placeholders until those categories get their own art.
