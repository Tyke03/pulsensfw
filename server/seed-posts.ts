// Seed posts from Polsia export
import { Pool } from 'pg';
import postsData from './polsia-export.json' assert { type: 'json' };

async function seed() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  let inserted = 0;
  let skipped = 0;

  for (const post of (postsData as any[])) {
    try {
      const tags = Array.isArray(post.tags) ? post.tags : [];
      const affiliateLinks = Array.isArray(post.affiliate_links) ? post.affiliate_links : (typeof post.affiliate_links === 'string' ? JSON.parse(post.affiliate_links || '[]') : []);
      const status = post.status || 'draft';

      await client.query(`
        INSERT INTO posts (title, slug, body, excerpt, category, tags, affiliate_links, meta_title, meta_description, featured_image, status, published_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (slug) DO NOTHING
      `, [
        post.title, post.slug, post.body || '', post.excerpt || null,
        post.category, tags, JSON.stringify(affiliateLinks),
        post.meta_title || null, post.meta_description || null, post.featured_image || null,
        status,
        post.published_at ? new Date(post.published_at) : null,
        post.created_at ? new Date(post.created_at) : new Date(),
        post.updated_at ? new Date(post.updated_at) : new Date(),
      ]);
      inserted++;
      console.log(`✓ ${status.toUpperCase()} — ${post.title.slice(0, 60)}`);
    } catch (e: any) {
      console.error(`✗ FAILED — ${post.title.slice(0, 60)}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} failed`);
  client.release();
  await pool.end();
}

seed().catch(err => { console.error(err.message); process.exit(1); });
