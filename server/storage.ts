import { db } from './db';
import { posts, adminTokens, affiliates, analytics, siteConfig } from '@shared/schema';
import type { Post, InsertPost, AdminToken, Affiliate, InsertAffiliate } from '@shared/schema';
import { eq, desc, and, sql, ilike, or } from 'drizzle-orm';
import crypto from 'crypto';

// ── Helpers ────────────────────────────────────────────────────────────────
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ── Posts ──────────────────────────────────────────────────────────────────
export const storage = {
  // List posts with optional filters
  async listPosts(opts: { status?: string; category?: string; tag?: string; page?: number; perPage?: number } = {}) {
    const { status, category, tag, page = 1, perPage = 20 } = opts;
    const limit = Math.min(perPage, 100);
    const offset = (Math.max(page, 1) - 1) * limit;

    let query = db.select().from(posts);
    const conditions = [];
    if (status) conditions.push(eq(posts.status, status));
    if (category) conditions.push(eq(posts.category, category));

    const baseQuery = conditions.length > 0
      ? db.select().from(posts).where(and(...conditions))
      : db.select().from(posts);

    const [rows, countRow] = await Promise.all([
      db.select().from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    // Tag filter in JS (Drizzle array operations are driver-specific)
    let filtered = tag ? rows.filter(p => Array.isArray(p.tags) && p.tags.includes(tag)) : rows;
    const total = parseInt(String(countRow[0]?.count ?? 0));
    return { rows: filtered, total, page, perPage: limit };
  },

  async getPost(id: number): Promise<Post | undefined> {
    return db.select().from(posts).where(eq(posts.id, id)).then(r => r[0]);
  },

  async getPostBySlug(slug: string): Promise<Post | undefined> {
    return db.select().from(posts).where(eq(posts.slug, slug)).then(r => r[0]);
  },

  async createPost(data: Partial<InsertPost>): Promise<Post> {
    const slug = data.slug || slugify(data.title || '');
    const status = data.status || 'draft';
    const row = await db.insert(posts).values({
      ...data,
      slug,
      status,
      publishedAt: status === 'published' ? new Date() : null,
    } as any).returning();
    return row[0];
  },

  async updatePost(id: number, data: Partial<InsertPost>): Promise<Post | undefined> {
    const existing = await storage.getPost(id);
    if (!existing) return undefined;

    const updates: any = { ...data, updatedAt: new Date() };
    if (data.title && !data.slug) updates.slug = slugify(data.title);
    if (data.status === 'published' && !existing.publishedAt) updates.publishedAt = new Date();

    const row = await db.update(posts).set(updates).where(eq(posts.id, id)).returning();
    return row[0];
  },

  async deletePost(id: number): Promise<boolean> {
    const r = await db.delete(posts).where(eq(posts.id, id)).returning();
    return r.length > 0;
  },

  async publishPost(id: number): Promise<Post | undefined> {
    const row = await db.update(posts).set({
      status: 'published',
      publishedAt: sql`COALESCE(published_at, NOW())`,
      updatedAt: new Date(),
    } as any).where(eq(posts.id, id)).returning();
    return row[0];
  },

  async unpublishPost(id: number): Promise<Post | undefined> {
    const row = await db.update(posts).set({ status: 'draft', updatedAt: new Date() }).where(eq(posts.id, id)).returning();
    return row[0];
  },

  async bulkUpsertPosts(items: any[]): Promise<any[]> {
    const results = [];
    for (const item of items) {
      if (item.id) {
        const r = await storage.updatePost(item.id, item);
        results.push(r || { error: 'Not found', id: item.id });
      } else {
        const r = await storage.createPost(item);
        results.push(r);
      }
    }
    return results;
  },

  // ── Tokens ────────────────────────────────────────────────────────────────
  async getTokenRow(token: string): Promise<AdminToken | undefined> {
    return db.select().from(adminTokens).where(eq(adminTokens.token, token)).then(r => r[0]);
  },

  async listTokens(): Promise<AdminToken[]> {
    return db.select().from(adminTokens).orderBy(desc(adminTokens.createdAt));
  },

  async createToken(label: string): Promise<AdminToken> {
    const token = generateToken();
    const row = await db.insert(adminTokens).values({ token, label }).returning();
    return row[0];
  },

  async revokeToken(id: number): Promise<boolean> {
    const r = await db.update(adminTokens).set({ revokedAt: new Date() }).where(eq(adminTokens.id, id)).returning();
    return r.length > 0;
  },

  async touchToken(id: number): Promise<void> {
    await db.update(adminTokens).set({ lastUsedAt: new Date() }).where(eq(adminTokens.id, id));
  },

  // ── Affiliates ─────────────────────────────────────────────────────────────
  async listAffiliates(category?: string): Promise<Affiliate[]> {
    if (category) {
      return db.select().from(affiliates)
        .where(and(eq(affiliates.active, true), eq(affiliates.category, category)))
        .orderBy(affiliates.name);
    }
    return db.select().from(affiliates).where(eq(affiliates.active, true)).orderBy(affiliates.name);
  },

  async listAllAffiliates(): Promise<Affiliate[]> {
    return db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
  },

  async createAffiliate(data: InsertAffiliate): Promise<Affiliate> {
    const row = await db.insert(affiliates).values(data).returning();
    return row[0];
  },

  async updateAffiliate(id: number, data: Partial<InsertAffiliate>): Promise<Affiliate | undefined> {
    const row = await db.update(affiliates).set(data).where(eq(affiliates.id, id)).returning();
    return row[0];
  },

  async deleteAffiliate(id: number): Promise<boolean> {
    const r = await db.delete(affiliates).where(eq(affiliates.id, id)).returning();
    return r.length > 0;
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  async recordPageview(path: string, referrer?: string, ua?: string): Promise<void> {
    await db.insert(analytics).values({ path, referrer, ua });
  },

  async getAnalytics(from?: string, to?: string) {
    const rows = await db.select().from(analytics).orderBy(desc(analytics.createdAt)).limit(1000);
    const total = rows.length;
    const pathCounts: Record<string, number> = {};
    const refCounts: Record<string, number> = {};
    for (const r of rows) {
      pathCounts[r.path] = (pathCounts[r.path] || 0) + 1;
      if (r.referrer) refCounts[r.referrer] = (refCounts[r.referrer] || 0) + 1;
    }
    const topPages = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, views]) => ({ path, views }));
    const topReferrers = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([referrer, count]) => ({ referrer, count }));
    return { total_pageviews: total, top_pages: topPages, top_referrers: topReferrers };
  },

  // ── Site Config ──────────────────────────────────────────────────────────
  async getSiteConfig(): Promise<Record<string, string>> {
    const rows = await db.select().from(siteConfig);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  },

  async setSiteConfig(key: string, value: string): Promise<void> {
    await db.insert(siteConfig).values({ key, value })
      .onConflictDoUpdate({ target: siteConfig.key, set: { value, updatedAt: new Date() } });
  },
};
