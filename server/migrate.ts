import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL required');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('Running migrations...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        body TEXT NOT NULL DEFAULT '',
        excerpt TEXT,
        category VARCHAR(50) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        affiliate_links JSONB DEFAULT '[]',
        meta_title TEXT,
        meta_description TEXT,
        featured_image TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT 'Agent Token',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        category VARCHAR(50),
        description TEXT,
        commission_notes TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        path TEXT NOT NULL,
        referrer TEXT,
        ua TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS site_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed the master admin token (same as Polsia token for continuity)
    await client.query(`
      INSERT INTO admin_tokens (token, label)
      VALUES ('85ac1d961e6826dc5a768985cc4d9a82b66a56a5c2e580775c5acafec175e1e9', 'Master Token (migrated from Polsia)')
      ON CONFLICT (token) DO NOTHING
    `);

    // Seed starter affiliates
    await client.query(`
      INSERT INTO affiliates (name, url, category, description, commission_notes) VALUES
        ('OnlyFans', 'https://onlyfans.com', 'industry-news', 'The leading creator subscription platform', 'No direct affiliate program — referral via third-party networks'),
        ('CrushOn.AI', 'https://crushon.ai/?ref=pulsensfw', 'ai-chatbots', 'Unrestricted NSFW AI chatbot platform', 'Up to 30% recurring commission'),
        ('SpicyChat.AI', 'https://spicychat.ai', 'ai-chatbots', 'Popular NSFW AI character chat platform', 'Check partner portal'),
        ('Lovense', 'https://www.lovense.com/?ref=pulsensfw', 'sex-tech', 'Industry-leading app-controlled sex toys', '10-15% per sale'),
        ('We-Vibe', 'https://we-vibe.com', 'sex-tech', 'Premium couples and solo smart toys', '8-12% per sale'),
        ('VRPorn.com', 'https://vrporn.com', 'vr', 'Top aggregator for VR adult content', 'Revenue share available'),
        ('BadoinkVR', 'https://badoinkvr.com', 'vr', 'High-quality VR adult studio', 'Affiliate program via partner networks'),
        ('SexualAlpha', 'https://sexualalpha.com', 'sex-tech', 'Male sex toy reviews and recommendations', 'Content partnership opportunities')
      ON CONFLICT DO NOTHING
    `);

    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
