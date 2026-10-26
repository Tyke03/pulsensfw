import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const image = z.object({
  alt: z.string(),
  plate: z.string(),
  explicit: z.boolean(),
  explicitId: z.string().optional(),
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
    topic: z.enum(['vr', 'toys', 'ai-chat', 'creators', 'news', 'guides', 'deals']),
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
    image: image,
    gear: gear.optional(),
  }),
});

export const collections = { articles };
