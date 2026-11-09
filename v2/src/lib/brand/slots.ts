import type { TopicId } from '../content/types';

/**
 * Drop-in art. Replace the file at the same path, or point `hero` / `cover`
 * at a new png/webp when the owner's category art arrives.
 * `hero` is the wide header plate on a section. `cover` is the fallback when
 * an article or entity has no picture of its own.
 */
export const CATEGORY_ART: Record<TopicId, { hero: string; cover: string }> = {
  stars: { hero: '/media/categories/stars/hero.svg', cover: '/media/categories/stars/cover.svg' },
  sites: { hero: '/media/categories/sites/hero.svg', cover: '/media/categories/sites/cover.svg' },
  ai: { hero: '/media/categories/ai/hero.png', cover: '/media/categories/ai/cover.png' },
  toys: { hero: '/media/categories/toys/hero.png', cover: '/media/categories/toys/cover.png' },
  vr: { hero: '/media/categories/vr/hero.png', cover: '/media/categories/vr/cover.png' },
  guides: { hero: '/media/categories/guides/hero.png', cover: '/media/categories/guides/cover.png' },
  lists: { hero: '/media/categories/lists/hero.png', cover: '/media/categories/lists/cover.png' },
  news: { hero: '/media/categories/news/hero.png', cover: '/media/categories/news/cover.png' },
};

export function categoryHero(topic: TopicId): string {
  return CATEGORY_ART[topic].hero;
}

export function categoryCover(topic: TopicId): string {
  return CATEGORY_ART[topic].cover;
}

/**
 * Owner chrome from the brand kit (`PulseNSFW-Site-Assets/chrome/*` plus the
 * numbered plates), at the drop-in paths under `public/`. Favicon/PWA sizes are
 * generated from the kit's 1024 render; og-default is the site's share card.
 * Nothing here is generated art — swap the file at the same path to rebrand.
 */
export const BRAND_ART = {
  ogDefault: '/og-default.png',
  favicon32: '/favicon-32.png',
  appleTouchIcon: '/apple-touch-icon.png',
  icon192: '/icon-192.png',
  icon512: '/icon-512.png',
  appIcon: '/media/brand/app-icon.png',
  monogramP: '/media/brand/monogram-p.png',
  reviewerAvatar: '/media/brand/avatar.png',
  heroBg: '/media/brand/hero-bg.png',
  emptyState: '/media/brand/empty-state.png',
  newsletterCta: '/media/brand/newsletter-cta.png',
  aboutHeader: '/media/brand/about-header.png',
  reviewerBadge: '/media/brand/reviewer-badge.png',
} as const;

