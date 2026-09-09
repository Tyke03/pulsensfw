import type { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { storage, slugify, generateToken } from './storage';

// ── Research file helpers ─────────────────────────────────────────────────
const RESEARCH_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'research') : path.join(process.cwd(), 'research');
const CATEGORIES_LIST = ['ai-chatbots', 'sex-tech', 'vr', 'industry-news', 'how-to', 'rankings'];

function getResearchFilePath(category: string): string {
  return path.join(RESEARCH_DIR, `${category}.md`);
}

function parseResearchFile(category: string): { lastUpdated: string | null; totalItems: number; unusedItems: number; usedItems: number; items: any[] } {
  const filePath = getResearchFilePath(category);
  if (!fs.existsSync(filePath)) {
    return { lastUpdated: null, totalItems: 0, unusedItems: 0, usedItems: 0, items: [] };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const lastUpdated = stat.mtime.toISOString();

  // Parse ITEM blocks
  const itemMatches = content.matchAll(/##\s+(ITEM-\d+)([\s\S]*?)(?=##\s+ITEM-|$)/g);
  const items: any[] = [];
  for (const match of itemMatches) {
    const id = match[1];
    const body = match[2].trim();
    const statusMatch = body.match(/\*\*Status:\*\*\s*(\S+)/);
    const status = statusMatch?.[1] || 'unknown';
    const articleMatch = body.match(/\*\*Article:\*\*\s*(.+)/);
    items.push({ id, status, article: articleMatch?.[1] || null, preview: body.substring(0, 200) });
  }

  return {
    lastUpdated,
    totalItems: items.length,
    unusedItems: items.filter(i => i.status === 'unused').length,
    usedItems: items.filter(i => i.status === 'used').length,
    items,
  };
}

function getResearchSessionLog(category: string): string[] {
  const logPath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'logs', `research-${category}.log`) : path.join(process.cwd(), 'agents', `research-${category}`, 'session.log');
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf-8');
  // Return last 5 run entries
  const entries = content.split(/(?=## \[\d{4}-\d{2}-\d{2})/g).filter(e => e.trim().startsWith('##'));
  return entries.slice(-5);
}

function getAgentSessionLog(agentPath: string, lastN = 5): string[] {
  const logPath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, agentPath) : path.join(process.cwd(), agentPath);
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf-8');
  const entries = content.split(/(?=## \[\d{4}-\d{2}-\d{2})/g).filter(e => e.trim().startsWith('##'));
  return entries.slice(-lastN);
}

function parseOpportunities(): any[] {
  const opPath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'affiliates', 'opportunities.md') : path.join(process.cwd(), 'agents', 'affiliate-manager', 'opportunities.md');
  if (!fs.existsSync(opPath)) return [];
  const content = fs.readFileSync(opPath, 'utf-8');
  const blocks = content.split(/(?=## )/).filter(b => b.trim().startsWith('## ') && !b.startsWith('# '));
  return blocks.map(block => {
    const nameMatch = block.match(/^## (.+)/);
    const signupMatch = block.match(/\*\*Signup URL:\*\*\s*(.+)/);
    const commissionMatch = block.match(/\*\*Commission:\*\*\s*(.+)/);
    const networkMatch = block.match(/\*\*Network:\*\*\s*(.+)/);
    const adultMatch = block.match(/\*\*Adult content accepted:\*\*\s*(.+)/);
    const barriersMatch = block.match(/\*\*Barriers:\*\*\s*(.+)/);
    const categoryMatch = block.match(/\*\*Category:\*\*\s*(.+)/);
    const foundMatch = block.match(/\*\*Found:\*\*\s*(.+)/);
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+)/);
    return {
      name: nameMatch?.[1]?.trim() || 'Unknown',
      signupUrl: signupMatch?.[1]?.trim() || null,
      commission: commissionMatch?.[1]?.trim() || null,
      network: networkMatch?.[1]?.trim() || null,
      adultAccepted: adultMatch?.[1]?.trim() || null,
      barriers: barriersMatch?.[1]?.trim() || null,
      category: categoryMatch?.[1]?.trim() || null,
      found: foundMatch?.[1]?.trim() || null,
      status: statusMatch?.[1]?.trim() || 'new',
    };
  });
}

// Pipeline cron schedule (UTC) — kept in sync with actual crons
// Used for the "next scheduled run" display in the admin UI (hardcoded, not live from Render)
const PIPELINE_SCHEDULE: Record<string, { times: string[]; type: string; category?: string }> = {
  'research-ai-chatbots':   { type: 'research', category: 'ai-chatbots',    times: ['01:00','05:00','09:00','13:00','17:00'] },
  'research-sex-tech':      { type: 'research', category: 'sex-tech',       times: ['01:10','05:10','09:10','13:10','17:10'] },
  'research-vr':            { type: 'research', category: 'vr',             times: ['01:20','05:20','09:20','13:20','17:20'] },
  'research-industry-news': { type: 'research', category: 'industry-news',  times: ['01:30','05:30','09:30','13:30','17:30'] },
  'research-how-to':        { type: 'research', category: 'how-to',         times: ['01:40','05:40','09:40','13:40','17:40'] },
  'research-rankings':      { type: 'research', category: 'rankings',       times: ['01:50','05:50','09:50','13:50','17:50'] },
  'writer-ai-chatbots':     { type: 'writer',   category: 'ai-chatbots',    times: ['04:00','12:00'] },
  'writer-sex-tech':        { type: 'writer',   category: 'sex-tech',       times: ['04:10','12:10'] },
  'writer-vr':              { type: 'writer',   category: 'vr',             times: ['04:20','12:20'] },
  'writer-industry-news':   { type: 'writer',   category: 'industry-news',  times: ['04:30','12:30'] },
  'writer-how-to':          { type: 'writer',   category: 'how-to',         times: ['04:40','12:40'] },
  'writer-rankings':        { type: 'writer',   category: 'rankings',       times: ['04:50','12:50'] },
  'qc':                     { type: 'qc',                                    times: ['06:00','14:00'] },
  'affiliate-manager':      { type: 'affiliate',                             times: ['02:00'] },
};

function getNextRun(times: string[]): string {
  const now = new Date();
  const todayUTC = now.toISOString().substring(0, 10);
  for (const t of times.sort()) {
    const candidate = new Date(`${todayUTC}T${t}:00Z`);
    if (candidate > now) return candidate.toISOString();
  }
  // All times today have passed — use first time tomorrow
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowUTC = tomorrow.toISOString().substring(0, 10);
  return new Date(`${tomorrowUTC}T${times[0]}:00Z`).toISOString();
}

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
async async function tokenAuth(req: Request & { adminToken?: any }, res: Response, next: NextFunction) {
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

  // ── QC Status (PATCH for manual override in admin UI) ───────────────
  app.patch('/api/admin/posts/:id/qc', tokenAuth, async (req, res) => {
    const { qc_status, qcStatus, qc_notes, qcNotes } = req.body;
    const status = qcStatus || qc_status;
    const notes = qcNotes || qc_notes;
    const VALID_STATUSES = ['pending', 'approved', 'revision_needed', 'fact_check'];
    if (status && !VALID_STATUSES.includes(status)) {
      return err(res, `Invalid qc_status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const update: any = {};
    if (status !== undefined) update.qcStatus = status;
    if (notes !== undefined) update.qcNotes = notes;
    if (Object.keys(update).length === 0) return err(res, 'qc_status or qc_notes required');
    const post = await storage.updatePost(parseInt(req.params.id), update);
    if (!post) return err(res, 'Post not found', 404);
    ok(res, post);
  });

  // ── Research Monitor API ───────────────────────────────────────────
  app.get('/api/research/:category', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const meta = parseResearchFile(category);
    const recentLog = getResearchSessionLog(category);
    ok(res, { ...meta, recentLog });
  });

  app.get('/api/research/:category/items', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const data = parseResearchFile(category);
    ok(res, data.items);
  });

  // In-memory job queue for research triggers
  const researchJobs = new Map<string, { status: 'running' | 'done' | 'error'; startedAt: string; message?: string }>();

  app.post('/api/research/:category/trigger', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const jobId = `${category}-${Date.now()}`;
    researchJobs.set(jobId, { status: 'running', startedAt: new Date().toISOString() });
    // Note: actual research agent execution is triggered via cron or manually by operator.
    // This endpoint queues the intent and returns a job ID for polling.
    // In v1, the manual trigger logs the intent and returns immediately.
    // TODO v2: integrate Render cron API or a job queue to actually fire the research agent.
    researchJobs.set(jobId, { status: 'done', startedAt: new Date().toISOString(), message: 'Manual trigger queued. The next scheduled research run will pick up this category. To run immediately, use the Render cron dashboard to trigger the individual research cron.' });
    ok(res, { jobId, status: 'queued', message: 'Research run queued. Check back at next scheduled time or trigger via Render dashboard.' });
  });

  app.get('/api/research/:category/trigger/:jobId', tokenAuth, async (req, res) => {
    const job = researchJobs.get(req.params.jobId);
    if (!job) return err(res, 'Job not found', 404);
    ok(res, job);
  });

  // ── Pipeline Status API ────────────────────────────────────────────
  app.get('/api/pipeline/status', tokenAuth, async (req, res) => {
    const agentStatuses = Object.entries(PIPELINE_SCHEDULE).map(([name, config]) => {
      const logPath = config.type === 'research' && config.category
        ? `agents/research-${config.category}/session.log`
        : config.type === 'writer' && config.category
        ? `agents/writers/writer-${['ai-chatbots','sex-tech','vr','industry-news','how-to','rankings'].indexOf(config.category) + 1}/session_log.md`
        : config.type === 'qc'
        ? 'agents/qc/session_log.md'
        : 'agents/affiliate-manager/session_log.md';

      const recentLogs = getAgentSessionLog(logPath, 3);
      const hasRun = recentLogs.length > 0;
      const lastRunMatch = recentLogs[recentLogs.length - 1]?.match(/## \[(\d{4}-\d{2}-\d{2}[T ]?[\d:]+)/);
      const lastRun = lastRunMatch?.[1] || null;

      // Detect system alerts in logs
      const allLogs = recentLogs.join('\n');
      const hasAlert = allLogs.includes('SYSTEM ALERT') || allLogs.includes('research-gap-report');

      return {
        name,
        type: config.type,
        category: config.category || null,
        schedule: config.times,
        nextRun: getNextRun(config.times),
        lastRun,
        status: hasAlert ? 'alert' : hasRun ? 'ok' : 'never_run',
        recentLogs,
      };
    });

    // Count alerts
    const alerts = agentStatuses.filter(a => a.status === 'alert');
    ok(res, { agents: agentStatuses, alertCount: alerts.length });
  });

  app.get('/api/pipeline/alerts', tokenAuth, async (req, res) => {
    const alerts: any[] = [];
    // Scan all session logs for unresolved SYSTEM ALERTs
    const logPaths = [
      ...CATEGORIES_LIST.map(c => ({ agent: `research-${c}`, path: `agents/research-${c}/session.log` })),
      ...([1,2,3,4,5,6].map(n => ({ agent: `writer-${n}`, path: `agents/writers/writer-${n}/session_log.md` }))),
      { agent: 'qc', path: 'agents/qc/session_log.md' },
      { agent: 'affiliate-manager', path: 'agents/affiliate-manager/session_log.md' },
    ];
    for (const { agent, path: relPath } of logPaths) {
      const fullPath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, relPath) : path.join(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const alertMatches = content.matchAll(/SYSTEM ALERT[:\s]+([^\n]+)/g);
      for (const match of alertMatches) {
        alerts.push({ agent, message: match[1].trim(), raw: match[0] });
      }
    }
    ok(res, { alerts, count: alerts.length });
  });

  // ── Affiliates Opportunities API ───────────────────────────────────
  app.get('/api/affiliates/opportunities', tokenAuth, async (req, res) => {
    const opportunities = parseOpportunities();
    ok(res, opportunities);
  });

  // Update opportunity status in opportunities.md
  app.patch('/api/affiliates/opportunities/:name', tokenAuth, async (req, res) => {
    const { name } = req.params;
    const { status } = req.body;
    const VALID = ['new', 'reviewed', 'enrolled', 'rejected'];
    if (!VALID.includes(status)) return err(res, `status must be one of: ${VALID.join(', ')}`);
    const opPath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'affiliates', 'opportunities.md') : path.join(process.cwd(), 'agents', 'affiliate-manager', 'opportunities.md');
    if (!fs.existsSync(opPath)) return err(res, 'opportunities.md not found', 404);
    let content = fs.readFileSync(opPath, 'utf-8');
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(## ${escapedName}[\\s\\S]*?\\*\\*Status:\\*\\*\\s*)(\\S+)`);
    if (!regex.test(content)) return err(res, 'Opportunity not found', 404);
    content = content.replace(regex, `$1${status}`);
    fs.writeFileSync(opPath, content, 'utf-8');
    ok(res, { updated: true, name, status });
  });

  // ── Research file write (agent use) ──────────────────────────────────────
  // PUT /api/admin/research/:category  (admin-auth, used by cron agents)
  // PUT /api/research/:category        (token-auth, legacy path)
  // Body: { items: string[], queries: string[] }
  // Appends new ITEM blocks to ## ITEMS and query entries to ## FRONTIER LOG
  async function appendToResearchFile(category: string, items: string[], queries: string[]): Promise<{ itemsAdded: number; queriesAdded: number }> {
    const filePath = getResearchFilePath(category);
    let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : `# Research File: ${category}\n**Category:** ${category}\n**Created:** ${new Date().toISOString().split('T')[0]}\n\n---\n\n## FRONTIER LOG\n<!-- No queries run yet -->\n\n---\n\n## ITEMS\n<!-- No items yet -->\n`;

    // Append queries to FRONTIER LOG
    if (queries && queries.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const queryLines = queries.map((q: string) => `[${today}] ${q}`).join('\n');
      if (content.includes('<!-- No queries run yet -->')) {
        content = content.replace('<!-- No queries run yet -->', queryLines);
      } else {
        // Find end of FRONTIER LOG section (before ---)
        const logEnd = content.indexOf('\n\n---\n\n## ITEMS');
        if (logEnd !== -1) {
          content = content.slice(0, logEnd) + '\n' + queryLines + content.slice(logEnd);
        } else {
          content += '\n' + queryLines;
        }
      }
    }

    // Append items to ITEMS section
    if (items && items.length > 0) {
      const itemsBlock = items.join('\n\n');
      if (content.includes('<!-- No items yet -->')) {
        content = content.replace('<!-- No items yet -->', itemsBlock);
      } else {
        content = content.trimEnd() + '\n\n' + itemsBlock + '\n';
      }
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { itemsAdded: items?.length ?? 0, queriesAdded: queries?.length ?? 0 };
  }


  app.get('/api/admin/research/:category', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const meta = parseResearchFile(category);
    const recentLog = getResearchSessionLog(category);
    ok(res, { ...meta, recentLog });
  });

  app.put('/api/admin/research/:category', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const { items = [], queries = [] } = req.body;
    if (!Array.isArray(items) || !Array.isArray(queries)) return err(res, 'items and queries must be arrays', 400);
    const result = await appendToResearchFile(category, items, queries);
    ok(res, { success: true, category, ...result });
  });

  app.put('/api/research/:category', tokenAuth, async (req, res) => {
    const { category } = req.params;
    if (!CATEGORIES_LIST.includes(category)) return err(res, 'Invalid category', 404);
    const { items = [], queries = [] } = req.body;
    if (!Array.isArray(items) || !Array.isArray(queries)) return err(res, 'items and queries must be arrays', 400);
    const result = await appendToResearchFile(category, items, queries);
    ok(res, { success: true, category, ...result });
  });


// ── Data directory initialisation ────────────────────────────────────────
app.post('/api/admin/init-data', tokenAuth, async (req, res) => {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    return res.status(400).json({ success: false, error: 'DATA_DIR env var not set — disk not mounted' });
  }
  const dirs = [
    path.join(dataDir, 'research'),
    path.join(dataDir, 'logs'),
    path.join(dataDir, 'affiliates'),
  ];
  const categories = ['ai-chatbots', 'sex-tech', 'vr', 'industry-news', 'how-to', 'rankings'];
  const created: string[] = [];
  const existing: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); created.push(dir); }
    else existing.push(dir);
  }

  // Seed empty research files if not present
  for (const cat of categories) {
    const filePath = path.join(dataDir, 'research', `${cat}.md`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# Research File: ${cat}\n**Category:** ${cat}\n**Created:** ${new Date().toISOString().split('T')[0]}\n\n---\n\n## FRONTIER LOG\n<!-- No queries run yet -->\n\n---\n\n## ITEMS\n<!-- No items yet -->\n`);
      created.push(filePath);
    } else existing.push(filePath);
  }

  // Seed empty opportunities.md if not present
  const opPath = path.join(dataDir, 'affiliates', 'opportunities.md');
  if (!fs.existsSync(opPath)) {
    fs.writeFileSync(opPath, '# Affiliate Opportunities\n<!-- Discovered programs go here -->\n');
    created.push(opPath);
  }

  return res.json({ success: true, created, existing });
});

}
