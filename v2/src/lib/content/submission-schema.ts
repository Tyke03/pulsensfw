import { z } from 'astro/zod';
import { articleCoverSchema, articleSourceSchema, gearSchema, ARTICLE_KINDS, ARTICLE_TOPICS } from './article-schema';
import { entityUpdateSchema } from './entity-schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const submissionArticleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug'),
  title: z.string().min(1),
  dek: z.string().min(1),
  topic: z.enum(ARTICLE_TOPICS),
  kind: z.enum(ARTICLE_KINDS),
  publishedAt: isoDate,
  updatedAt: isoDate.optional(),
  badges: z.array(z.enum(['new', 'updated'])).optional(),
  author: z.string().min(1),
  kicker: z.string().min(1),
  readingMinutes: z.number().int().positive(),
  placement: z.enum(['lead', 'stack', 'none']),
  rails: z.array(z.enum(['trending', 'latest', 'editors', 'guides', 'top10'])).optional(),
  tags: z.array(z.string()).optional(),
  cover: articleCoverSchema,
  entities: z.array(z.string()).default([]),
  sources: z.array(articleSourceSchema).default([]),
  checkedAt: isoDate.optional(),
  gear: gearSchema.optional(),
  body: z.string().min(1),
}).strict();

export const submissionSchema = z.object({
  article: submissionArticleSchema,
  entity_updates: z.array(entityUpdateSchema).default([]),
}).strict();

export type Submission = z.infer<typeof submissionSchema>;
