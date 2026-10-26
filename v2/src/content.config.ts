import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const license = z.enum(['press-kit', 'affiliate-asset', 'screenshot', 'own-art', 'example']);

const image = z.object({
  alt: z.string(),
  url: z.string().optional(),
  credit: z.string().optional(),
  sourceUrl: z.string().optional(),
  license: license,
  explicit: z.boolean(),
  explicitId: z.string().optional(),
  record2257: z.string().optional(),
  plate: z.string().optional(),
});

const gear = z.object({
  product: z.string(),
  score: z.number(),
  ratings: z.array(z.object({ label: z.string(), value: z.number() })),
  specs: z.array(z.object({ label: z.string(), value: z.string() })),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  verdict: z.string(),
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    dek: z.string(),
    topic: z.enum(['stars', 'sites', 'ai', 'toys', 'vr', 'guides', 'lists', 'news']),
    kind: z.enum(['review', 'guide', 'news', 'list', 'comparison']),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    badges: z.array(z.enum(['new', 'updated'])).optional(),
    author: z.string(),
    kicker: z.string(),
    readingMinutes: z.number(),
    placement: z.enum(['lead', 'stack', 'none']),
    rails: z.array(z.enum(['trending', 'latest', 'editors', 'guides', 'top10'])).optional(),
    tags: z.array(z.string()).optional(),
    example: z.literal(true),
    cover: image.refine((img) => img.explicit === false, { message: 'SFW cover is required' }),
    explicitImages: z.array(image).optional(),
    entries: z.array(z.object({
      kind: z.enum(['star', 'site', 'product', 'game', 'ai']),
      id: z.string(),
      blurb: z.string(),
    })).optional(),
    gear: gear.optional(),
  }),
});

export const collections = { articles };
