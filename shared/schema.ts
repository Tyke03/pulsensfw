import { pgTable, serial, text, timestamp, boolean, integer, varchar, jsonb } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ── Posts ──────────────────────────────────────────────────────────────────
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  body: text('body').notNull().default(''),
  excerpt: text('excerpt'),
  category: varchar('category', { length: 50 }).notNull(),
  tags: text('tags').array().default([]),
  affiliateLinks: jsonb('affiliate_links').default([]),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  featuredImage: text('featured_image'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Post = typeof posts.$inferSelect;
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;

// ── Admin Tokens ───────────────────────────────────────────────────────────
export const adminTokens = pgTable('admin_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  label: text('label').notNull().default('Agent Token'),
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
});

export type AdminToken = typeof adminTokens.$inferSelect;
export const insertTokenSchema = createInsertSchema(adminTokens).omit({ id: true, createdAt: true });
export type InsertToken = z.infer<typeof insertTokenSchema>;

// ── Affiliates ─────────────────────────────────────────────────────────────
export const affiliates = pgTable('affiliates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: varchar('category', { length: 50 }),
  description: text('description'),
  commissionNotes: text('commission_notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true });
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;

// ── Analytics ──────────────────────────────────────────────────────────────
export const analytics = pgTable('analytics', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(),
  referrer: text('referrer'),
  ua: text('ua'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Site Config ────────────────────────────────────────────────────────────
export const siteConfig = pgTable('site_config', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
