import type { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { storage, slugify, generateToken } from './storage';

const CATEGORIES = [
  { slug: 'ai-chatbots', name: 'AI Chatbots', icon: '🤖' },
  { slug: 'sex-tech', name: 'Sex Tech', icon: '💠' },
  { slug: 'vr', name: 'VR & Immersive', icon: '👓' },
  { slug: 'industry-news', name: 'Industry News', icon: '📰' },
  { slug: 'how-to', name: 'How-To & Educational', icon: '📚' },
  { slug: 'rankings', name: 'Rankings & Lists', icon: '⚡' },
];

const SITE_URL = process.env.SITE_URL || 'https://pulsensfw.com';

// Rate limiting (per token)
const rateLimitMap = new Map<number, number[]>();
function checkRateLimit(tokenId: number): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 100;
  const hits = (rateLimitMap.get(tokenId) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  rateLimitMap.set(tokenId, hits);
  return true;
}

// ── Token Auth Middleware ──────────────────────────────────────────────────
async function tokenAuth(req: Request & { adminToken?: any }, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7).trim();
  const tokenRow = await storage.getTokenRow(token);
  if (!tokenRow) return res.status(401).json({ success: false, error: 'Invalid token' });
  if (tokenRow.revokedAt) return res.status(401).json({ success: false, error: 'Token has been revoked' });
  if (!checkRateLimit(tokenRow.id)) return res.status(429).json({ success: false, error: 'Rate limit exceeded (100 req/min)' });
  storage.touchToken(tokenRow.id).catch(() => {});
  req.adminToken = tokenRow;
  next();
}

// ── Field normalizer — accept both snake_case and camelCase from agents ──
function normalizePostFields(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const b = { ...body };
  // snake_case → camelCase promotion (agents may send either)
  if (b.meta_title   !== undefined && b.metaTitle   === undefined) { b.metaTitle   = b.meta_title;   delete b.meta_title; }
  if (b.meta_description !== undefined && b.metaDescription === undefined) { b.metaDescription = b.meta_description; delete b.meta_description; }
  if (b.published_at !== undefined && b.publishedAt === undefined) { b.publishedAt = b.published_at; delete b.published_at; }
  if (b.created_at   !== undefined && b.createdAt   === undefined) { b.createdAt   = b.created_at;   delete b.created_at; }
  if (b.updated_at   !== undefined && b.updatedAt   === undefined) { b.updatedAt   = b.updated_at;   delete b.updated_at; }
  return b;
}

// ── Response helpers ──────────────────────────────────────────────────────
function ok(res: Response, data: any, meta: any = {}, status = 200) {
  const envelope: any = { success: true, data };
  if (Object.keys(meta).length > 0) envelope.meta = meta;
  res.status(status).json(envelope);
}
function err(res: Response, error: string, status = 400) {
  res.status(status).json({ success: false, error });
}

// ── SEO helpers ──────────────────────────────────────────────────────────
async function pingIndexNow(url: string) {
  try {
    await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=pulsensfw`);
  } catch {}
}

export function registerRoutes(httpServer: Server, app: Express) {

  // ── Health ────────────────────────────────────────────────────────────
  app.get('/health', (_, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString() }));
  app.get('/api/admin/health', tokenAuth, (_, res) => res.json({ success: true, data: { db: 'connected', uptime: process.uptime() } }));

  // ── Analytics beacon ─────────────────────────────────────────────────
  app.post('/api/analytics', async (req, res) => {
    const { path, referrer, ua } = req.body || {};
    if (path) await storage.recordPageview(path, referrer, ua).catch(() => {});
    res.status(204).end();
  });

  // ── Public API: posts for the frontend ───────────────────────────────
  app.get('/api/posts', async (req, res) => {
    const { category, tag, page = '1', per_page = '12' } = req.query as any;
    const result = await storage.listPosts({
      status: 'published',
      category,
      tag,
      page: parseInt(page),
      perPage: parseInt(per_page),
    });
    ok(res, result.rows, { pagination: { page: result.page, per_page: result.perPage, total: result.total, total_pages: Math.ceil(result.total / result.perPage) } });
  });

  app.get('/api/posts/:slug', async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post || post.status !== 'published') return err(res, 'Not found', 404);
    ok(res, post);
  });

  app.get('/api/related/:slug', async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post) return err(res, 'Not found', 404);
    const all = await storage.listPosts({ status: 'published', category: post.category, perPage: 6 });
    const related = all.rows.filter(p => p.id !== post.id).slice(0, 3);
    ok(res, related);
  });

  app.get('/api/categories', (_, res) => {
    ok(res, CATEGORIES);
  });

  app.get('/api/affiliates', async (req, res) => {
    const { category } = req.query as any;
    const list = await storage.listAffiliates(category);
    ok(res, list);
  });

  // ── Sitemap ───────────────────────────────────────────────────────────
  app.get('/sitemap.xml', async (req, res) => {
    const result = await storage.listPosts({ status: 'published', perPage: 500 });
    const today = new Date().toISOString().split('T')[0];
    let urls = `<url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>\n`;
    for (const cat of CATEGORIES) {
      urls += `<url><loc>${SITE_URL}/#/category/${cat.slug}</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>\n`;
    }
    for (const p of result.rows) {
      const lastmod = ((p.updatedAt || p.publishedAt) as Date)?.toISOString()?.split('T')[0] || today;
      urls += `<url><loc>${SITE_URL}/#/post/${p.slug}</loc><lastmod>${lastmod}</lastmod><priority>0.8</priority></url>\n`;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;
    res.type('application/xml').send(xml);
  });

  app.get('/robots.txt', (_, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml`);
  });

  // ════════════════════════════════════════════════════════════════════
  //  ADMIN API — all routes require token auth
  // ════════════════════════════════════════════════════════════════════

  // ── Capabilities self-discovery ───────────────────────────────────
  app.get('/api/admin/capabilities', tokenAuth, (_, res) => {
    ok(res, {
      version: '2.0',
      base_url: SITE_URL,
      auth: 'Bearer token in Authorization header',
      endpoints: {
        posts: {
          'GET /api/admin/posts': 'List posts (params: status, category, tag, page, per_page)',
          'GET /api/admin/posts/:id': 'Get single post',
          'POST /api/admin/posts': 'Create post',
          'PUT /api/admin/posts/:id': 'Update post',
          'DELETE /api/admin/posts/:id': 'Delete post',
          'POST /api/admin/posts/:id/publish': 'Publish a draft',
          'POST /api/admin/posts/:id/unpublish': 'Unpublish to draft',
          'POST /api/admin/posts/bulk': 'Bulk upsert up to 50 posts',
        },
        affiliates: {
          'GET /api/admin/affiliates': 'List all affiliates',
          'POST /api/admin/affiliates': 'Create affiliate',
          'PUT /api/admin/affiliates/:id': 'Update affiliate',
          'DELETE /api/admin/affiliates/:id': 'Delete affiliate',
        },
        tokens: {
          'GET /api/admin/tokens': 'List all tokens',
          'POST /api/admin/tokens': 'Generate new token (body: { label })',
          'DELETE /api/admin/tokens/:id': 'Revoke token',
        },
        analytics: { 'GET /api/admin/analytics': 'Pageview stats' },
        site: {
          'GET /api/admin/site': 'Read site content/config',
          'PUT /api/admin/site': 'Update site name, tagline, etc.',
        },
        categories: { 'GET /api/admin/categories': 'List categories with post counts' },
      },
      post_schema: {
        title: 'string (required)',
        body: 'string HTML (required)',
        category: 'ai-chatbots | sex-tech | vr | industry-news | how-to | rankings',
        excerpt: 'string (1-2 sentences)',
        tags: 'string[]',
        status: 'draft | published',
        metaTitle: 'string (50-60 chars) — also accepts meta_title',
        metaDescription: 'string (140-155 chars) — also accepts meta_description',
        affiliate_links: '[{ url, name }]',
      },
    });
  });

  // ── Posts CRUD ────────────────────────────────────────────────────
  app.get('/api/admin/posts', tokenAuth, async (req, res) => {
    const { status, category, tag, page = '1', per_page = '20' } = req.query as any;
    const result = await storage.listPosts({ status, category, tag, page: parseInt(page), perPage: parseInt(per_page) });
    ok(res, result.rows, { pagination: { page: result.page, per_page: result.perPage, total: result.total, total_pages: Math.ceil(result.total / result.perPage) } });
  });

  app.get('/api/admin/posts/:id', tokenAuth, async (req, res) => {
    const post = await storage.getPost(parseInt(req.params.id));
    if (!post) return err(res, 'Post not found', 404);
    ok(res, post);
  });

  app.post('/api/admin/posts', tokenAuth, async (req, res) => {
    const normalized = normalizePostFields(req.body);
    const { title, body, category } = normalized;
    if (!title) return err(res, 'title is required');
    if (!body) return err(res, 'body is required');
    if (!category) return err(res, 'category is required');
    const post = await storage.createPost(normalized);
    if (post.status === 'published') pingIndexNow(`${SITE_URL}/#/post/${post.slug}`);
    ok(res, post, {}, 201);
  });

  app.put('/api/admin/posts/:id', tokenAuth, async (req, res) => {
    const post = await storage.updatePost(parseInt(req.params.id), normalizePostFields(req.body));
    if (!post) return err(res, 'Post not found', 404);
    ok(res, post);
  });

  app.delete('/api/admin/posts/:id', tokenAuth, async (req, res) => {
    const deleted = await storage.deletePost(parseInt(req.params.id));
    if (!deleted) return err(res, 'Post not found', 404);
    ok(res, { deleted: true, id: parseInt(req.params.id) });
  });

  app.post('/api/admin/posts/:id/publish', tokenAuth, async (req, res) => {
    const post = await storage.publishPost(parseInt(req.params.id));
    if (!post) return err(res, 'Post not found', 404);
    pingIndexNow(`${SITE_URL}/#/post/${post.slug}`);
    ok(res, post);
  });

  app.post('/api/admin/posts/:id/unpublish', tokenAuth, async (req, res) => {
    const post = await storage.unpublishPost(parseInt(req.params.id));
    if (!post) return err(res, 'Post not found', 404);
    ok(res, post);
  });

  // Legacy PUT versions (backward compat with Polsia debrief)
  app.put('/api/admin/posts/:id/publish', tokenAuth, async (req, res) => {
    const post = await storage.publishPost(parseInt(req.params.id));
    if (!post) return err(res, 'Post not found', 404);
    pingIndexNow(`${SITE_URL}/#/post/${post.slug}`);
    ok(res, post);
  });
  app.put('/api/admin/posts/:id/unpublish', tokenAuth, async (req, res) => {
    const post = await storage.unpublishPost(parseInt(req.params.id));
    if (!post) return err(res, 'Post not found', 404);
    ok(res, post);
  });

  app.post('/api/admin/posts/bulk', tokenAuth, async (req, res) => {
    const { posts: items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return err(res, 'posts array required');
    if (items.length > 50) return err(res, 'Maximum 50 posts per bulk call');
    const results = await storage.bulkUpsertPosts(items);
    ok(res, { results, count: results.length }, {}, 201);
  });

  // ── Categories ────────────────────────────────────────────────────
  app.get('/api/admin/categories', tokenAuth, async (_, res) => {
    const result = await storage.listPosts({ status: 'published', perPage: 500 });
    const countMap: Record<string, number> = {};
    for (const p of result.rows) countMap[p.category] = (countMap[p.category] || 0) + 1;
    const categories = CATEGORIES.map(c => ({ ...c, post_count: countMap[c.slug] || 0 }));
    ok(res, categories);
  });

  // ── Affiliates ────────────────────────────────────────────────────
  app.get('/api/admin/affiliates', tokenAuth, async (_, res) => {
    const list = await storage.listAllAffiliates();
    ok(res, list);
  });

  app.post('/api/admin/affiliates', tokenAuth, async (req, res) => {
    const { name, url } = req.body;
    if (!name || !url) return err(res, 'name and url are required');
    const affiliate = await storage.createAffiliate(req.body);
    ok(res, affiliate, {}, 201);
  });

  app.put('/api/admin/affiliates/:id', tokenAuth, async (req, res) => {
    const affiliate = await storage.updateAffiliate(parseInt(req.params.id), req.body);
    if (!affiliate) return err(res, 'Affiliate not found', 404);
    ok(res, affiliate);
  });

  app.delete('/api/admin/affiliates/:id', tokenAuth, async (req, res) => {
    const deleted = await storage.deleteAffiliate(parseInt(req.params.id));
    if (!deleted) return err(res, 'Affiliate not found', 404);
    ok(res, { deleted: true, id: parseInt(req.params.id) });
  });

  // ── Token Management ───────────────────────────────────────────────
  app.get('/api/admin/tokens', tokenAuth, async (_, res) => {
    const tokens = await storage.listTokens();
    // Never expose the raw token value in listings — only the last 8 chars
    const safe = tokens.map(t => ({ ...t, token: '••••••••' + t.token.slice(-8) }));
    ok(res, safe);
  });

  app.post('/api/admin/tokens', tokenAuth, async (req, res) => {
    const { label = 'New Token' } = req.body;
    const token = await storage.createToken(label);
    // Return full token only on creation
    ok(res, token, {}, 201);
  });

  app.delete('/api/admin/tokens/:id', tokenAuth, async (req, res) => {
    const revoked = await storage.revokeToken(parseInt(req.params.id));
    if (!revoked) return err(res, 'Token not found', 404);
    ok(res, { revoked: true, id: parseInt(req.params.id) });
  });

  // ── Analytics ─────────────────────────────────────────────────────
  app.get('/api/admin/analytics', tokenAuth, async (req, res) => {
    const { from, to } = req.query as any;
    const data = await storage.getAnalytics(from, to);
    ok(res, data);
  });

  // ── Site Config ───────────────────────────────────────────────────
  app.get('/api/admin/site', tokenAuth, async (_, res) => {
    const config = await storage.getSiteConfig();
    ok(res, {
      site_name: config.site_name || 'PulseNSFW',
      tagline: config.tagline || 'The most comprehensive, unbiased, and always-current NSFW content hub.',
      description: config.description || 'Thoroughly researched NSFW reviews, guides, and comparisons.',
      contact_email: config.contact_email || 'admin@pulsensfw.com',
      footer_text: config.footer_text || 'This site may use affiliate links.',
      site_url: SITE_URL,
      categories: CATEGORIES,
    });
  });

  app.put('/api/admin/site', tokenAuth, async (req, res) => {
    const allowed = ['site_name', 'tagline', 'description', 'footer_text', 'contact_email'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) await storage.setSiteConfig(key, req.body[key]);
    }
    ok(res, { updated: true });
  });

  app.get('/api/admin/config', tokenAuth, async (_, res) => {
    const config = await storage.getSiteConfig();
    ok(res, { config, environment: { site_url: SITE_URL, categories_count: CATEGORIES.length } });
  });

  app.put('/api/admin/config', tokenAuth, async (req, res) => {
    const { config } = req.body;
    if (!config || typeof config !== 'object') return err(res, 'config object required');
    const BLOCKED = ['DATABASE_URL', 'ADMIN_PASSWORD'];
    for (const [k, v] of Object.entries(config)) {
      if (!BLOCKED.includes(k)) await storage.setSiteConfig(k, String(v));
    }
    ok(res, { updated: true });
  });

  // ── Subscribers (stub for future) ─────────────────────────────────
  app.get('/api/admin/subscribers', tokenAuth, (_, res) => {
    ok(res, { subscribers: [], count: 0, note: 'Email subscriber list — connect an ESP to populate.' });
  });
}
