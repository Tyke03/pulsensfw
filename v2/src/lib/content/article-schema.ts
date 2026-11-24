import { z } from 'astro/zod';
import { ENTITY_LICENSES } from './entity-schema';

export const ARTICLE_TOPICS = ['stars', 'sites', 'ai', 'toys', 'vr', 'guides', 'lists', 'news'] as const;
export type ArticleTopic = (typeof ARTICLE_TOPICS)[number];

export const ARTICLE_KINDS = ['top_list', 'star_profile', 'site_review', 'review', 'guide', 'news'] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_LICENSES = [...ENTITY_LICENSES, 'example'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const articleCoverSchema = z.object({
  alt: z.string(),
  url: z.string().optional(),
  credit: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  license: z.enum(ARTICLE_LICENSES),
  explicit: z.literal(false),
  plate: z.string().optional(),
});

export const articleSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  checked: isoDate.optional(),
});

export const gearSchema = z.object({
  product: z.string(),
  score: z.number(),
  ratings: z.array(z.object({ label: z.string(), value: z.number() })),
  specs: z.array(z.object({ label: z.string(), value: z.string() })),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  verdict: z.string(),
});

export const articleFrontmatterSchema = z.object({
  title: z.string(),
  dek: z.string(),
  topic: z.enum(ARTICLE_TOPICS),
  kind: z.enum(ARTICLE_KINDS),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  badges: z.array(z.enum(['new', 'updated'])).optional(),
  author: z.string(),
  kicker: z.string(),
  readingMinutes: z.number(),
  placement: z.enum(['lead', 'stack', 'none']),
  rails: z.array(z.enum(['trending', 'latest', 'editors', 'guides', 'top10'])).optional(),
  tags: z.array(z.string()).optional(),
  cover: articleCoverSchema,
  entities: z.array(z.string()).default([]),
  sources: z.array(articleSourceSchema).default([]),
  checkedAt: z.coerce.date().optional(),
  gear: gearSchema.optional(),
});

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;

export const submissionArticleSchema = articleFrontmatterSchema.extend({
  body: z.string().min(1),
});
export type SubmissionArticle = z.infer<typeof submissionArticleSchema>;
