import { z } from 'astro/zod';

/**
 * One row per file. The shape is deliberately flat (one JSON object ->
 * one Supabase row) except `pricing`, `image`, and `facts`, which map to
 * JSONB or a child table by `entity_slug`.
 *
 * Files live at src/content/entities/<slug>.json. Slug is the stable key
 * articles use; nothing else in an article may copy these facts.
 */
export const ENTITY_TYPES = ['star', 'site', 'ai_app', 'product', 'game'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LICENSES = [
  'press-kit',
  'affiliate-asset',
  'screenshot',
  'own-art',
  'brand-kit',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'cc-by-3.0',
  'cc-by-sa-2.5',
  'public-domain',
] as const;
export type EntityLicense = (typeof ENTITY_LICENSES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const pricingPlanSchema = z.object({
  name: z.string().min(1),
  price: z.string().min(1),
  billing: z.string().min(1).default('month'),
  notes: z.string().default(''),
});
export type PricingPlan = z.infer<typeof pricingPlanSchema>;

export const pricingSchema = z.object({
  model: z.string().min(1).default('Unknown'),
  free_tier: z.string().nullable().default(null),
  from_price: z.string().nullable().default(null),
  currency: z.string().min(1).default('USD'),
  plans: z.array(pricingPlanSchema).default([]),
  notes: z.string().nullable().default(null),
});
export type Pricing = z.infer<typeof pricingSchema>;

export const entityImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1),
  source_url: z.string().url(),
  license: z.enum(ENTITY_LICENSES),
  nsfw: z.literal(false),
});
export type EntityImage = z.infer<typeof entityImageSchema>;

export const entityFactSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  source_url: z.string().url(),
  checked: isoDate,
});
export type EntityFact = z.infer<typeof entityFactSchema>;

export const entitySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug'),
  type: z.enum(ENTITY_TYPES),
  name: z.string().min(1),
  url: z.string().url(),
  affiliate_url: z.string().url().nullable(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  pricing: pricingSchema,
  platforms: z.array(z.string()).default([]),
  score: z.number().min(0).max(10).nullable(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  image: entityImageSchema,
  facts: z.array(entityFactSchema).default([]),
  updated: isoDate,
});
export type Entity = z.infer<typeof entitySchema>;

/** Partial merge payload used by `npm run ingest`. */
export const entityUpdateSchema = entitySchema.partial().extend({
  slug: entitySchema.shape.slug,
  pricing: pricingSchema.partial().extend({
    plans: z.array(pricingPlanSchema).optional(),
  }).optional(),
  image: entityImageSchema.partial().optional(),
  facts: z.array(entityFactSchema).optional(),
});
export type EntityUpdate = z.infer<typeof entityUpdateSchema>;
