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
  ai: { hero: '/media/categories/ai/hero.svg', cover: '/media/categories/ai/cover.svg' },
  toys: { hero: '/media/categories/toys/hero.svg', cover: '/media/categories/toys/cover.svg' },
  vr: { hero: '/media/categories/vr/hero.svg', cover: '/media/categories/vr/cover.svg' },
  guides: { hero: '/media/categories/guides/hero.svg', cover: '/media/categories/guides/cover.svg' },
  lists: { hero: '/media/categories/lists/hero.svg', cover: '/media/categories/lists/cover.svg' },
  news: { hero: '/media/categories/news/hero.svg', cover: '/media/categories/news/cover.svg' },
};

export function categoryHero(topic: TopicId): string {
  return CATEGORY_ART[topic].hero;
}

export function categoryCover(topic: TopicId): string {
  return CATEGORY_ART[topic].cover;
}
