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
  // ── QC & Research pipeline fields (rebuild v2) ──
  qcStatus: text('qc_status').default('pending'),         // pending | approved | revision_needed | fact_check
  qcNotes: text('qc_notes'),                              // QC annotation written by QC agent
  researchSource: text('research_source'),                // e.g. "ai-chatbots/ITEM-7"
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
  // ── Tracking & discovery fields (rebuild v2) ──
  trackingStatus: text('tracking_status').default('unverified'), // real | placeholder | broken | unverified
  signupUrl: text('signup_url'),                                  // direct affiliate signup URL
  commissionRate: text('commission_rate'),                        // e.g. "20% per sale"
  notes: text('notes'),                                          // replaces / extends commissionNotes
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

// ── Agent Fleet & Orchestrator (rebuild v3, additive-only) ────────────────
// NOTE: these tables are created by server/migrations/001_agent_fleet.sql
// (server/migrate-v2.ts). All are new; no legacy table is altered except a
// defensive CREATE TABLE IF NOT EXISTS for agent_instructions (already live
// in Neon — the DDL is a no-op there).

export const workItems = pgTable('work_items', {
  id: serial('id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  queue: varchar('queue', { length: 20 }).notNull().default('daily'), // daily | backfill
  type: varchar('type', { length: 30 }).notNull(), // research|draft|end_rail|qc|health_check|audit|visual
  role: varchar('role', { length: 60 }).notNull(), // agent id, e.g. research-vr
  category: varchar('category', { length: 50 }),
  priority: integer('priority').notNull().default(5),
  state: varchar('state', { length: 40 }).notNull().default('discovered'),
  sourceRef: text('source_ref'), // e.g. "research/industry-news.md#ITEM-7"
  sourcePayload: jsonb('source_payload'),
  context: jsonb('context'),
  transitionHistory: jsonb('transition_history').default([]),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  backoffUntil: timestamp('backoff_until'),
  lastError: jsonb('last_error'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentRuns = pgTable('agent_runs', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  role: varchar('role', { length: 60 }).notNull(),
  promptId: text('prompt_id').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model'),
  provider: text('provider'),
  mode: varchar('mode', { length: 20 }).notNull().default('production'), // production|shadow|dry_run
  inputHash: text('input_hash'),
  outputHash: text('output_hash'),
  output: jsonb('output'),
  status: varchar('status', { length: 30 }).notNull(), // succeeded|schema_invalid|failed|refused|escalated
  error: text('error'),
  durationMs: integer('duration_ms'),
  attempt: integer('attempt').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentLeases = pgTable('agent_leases', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull(),
  leaseKey: text('lease_key').notNull(), // worker/run identity
  attempt: integer('attempt').notNull().default(1),
  acquiredAt: timestamp('acquired_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  releasedAt: timestamp('released_at'),
});

export const reviewEscalations = pgTable('review_escalations', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  role: varchar('role', { length: 60 }).notNull(),
  reasonCode: varchar('reason_code', { length: 60 }).notNull(),
  detail: jsonb('detail'),
  status: varchar('status', { length: 20 }).notNull().default('open'), // open|resolved|dismissed
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  postId: integer('post_id'),
  assetSource: varchar('asset_source', { length: 40 }).notNull(), // brand-kit|generated|licensed-editorial|provided|approved-external
  assetUrlOrObjectKey: text('asset_url_or_object_key'),
  altText: text('alt_text'),
  caption: text('caption'),
  attribution: text('attribution'),
  contentSafetyClassification: text('content_safety_classification'),
  rightsLicensingStatus: text('rights_licensing_status'),
  generationPromptOrProvenance: text('generation_prompt_or_provenance'),
  cropOrFocalPoint: jsonb('crop_or_focal_point'),
  status: varchar('status', { length: 20 }).notNull().default('proposed'), // proposed|approved|rejected|ready
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const endRailPlans = pgTable('end_rail_plans', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  postId: integer('post_id'),
  relatedPostIds: jsonb('related_post_ids').default([]),
  relatedPostSlugs: jsonb('related_post_slugs').default([]),
  affiliateRegistryId: integer('affiliate_registry_id'),
  affiliateResolutionReason: text('affiliate_resolution_reason'),
  fallbackMode: varchar('fallback_mode', { length: 20 }).notNull().default('internal_only'), // affiliate|internal_only
  disclosureText: text('disclosure_text'),
  validationStatus: varchar('validation_status', { length: 20 }).notNull().default('pending'), // pending|valid|invalid
  validationDetail: jsonb('validation_detail'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const affiliateHealthChecks = pgTable('affiliate_health_checks', {
  id: serial('id').primaryKey(),
  affiliateId: integer('affiliate_id'),
  url: text('url').notNull(),
  status: varchar('status', { length: 40 }).notNull(), // healthy|redirect|redirect_to_home|rate_limited_inconclusive|broken|disabled|expired|unknown
  httpStatus: integer('http_status'),
  redirectTarget: text('redirect_target'),
  checkerRunId: integer('checker_run_id'),
  notes: text('notes'),
  checkedAt: timestamp('checked_at').defaultNow(),
});

export const publishDecisions = pgTable('publish_decisions', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  postId: integer('post_id'),
  decision: varchar('decision', { length: 20 }).notNull(), // published|blocked
  qcRecommendation: varchar('qc_recommendation', { length: 20 }),
  gates: jsonb('gates'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  actor: text('actor').notNull().default('orchestrator'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orchestrationEvents = pgTable('orchestration_events', {
  id: serial('id').primaryKey(),
  workItemId: integer('work_item_id'),
  runId: integer('run_id'),
  type: varchar('type', { length: 60 }).notNull(),
  mode: varchar('mode', { length: 20 }).notNull().default('production'),
  actor: text('actor').notNull().default('orchestrator'),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentInstructions = pgTable('agent_instructions', {
  id: serial('id').primaryKey(),
  target: varchar('target', { length: 60 }).notNull(),
  instruction: text('instruction').notNull(),
  persist: boolean('persist').notNull().default(false),
  active: boolean('active').notNull().default(true),
  consumedBy: jsonb('consumed_by').default([]),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').notNull().default('brent-manual'),
});

export type AgentInstruction = typeof agentInstructions.$inferSelect;
