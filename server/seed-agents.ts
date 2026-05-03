/**
 * seed-agents.ts
 * Seeds one dedicated API token per PulseNSFW agent.
 * Run once: npm run seed-agents
 * Idempotent — uses label as the unique key, won't create duplicates.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import crypto from 'crypto';

const AGENTS = [
  // 6 content writers
  { label: 'agent:writer-1', description: 'AI Chatbots & Companions — Writer 1' },
  { label: 'agent:writer-2', description: 'Sex Tech & Hardware — Writer 2' },
  { label: 'agent:writer-3', description: 'VR & Immersive Experiences — Writer 3' },
  { label: 'agent:writer-4', description: 'Industry News & Creator Economy — Writer 4' },
  { label: 'agent:writer-5', description: 'How-To & Educational Content — Writer 5' },
  { label: 'agent:writer-6', description: 'Rankings, Lists & Comparisons — Writer 6' },
  // Research hub
  { label: 'agent:research-hub', description: 'Research Hub — topic discovery, trend scanning, content calendar' },
];

async function seedAgents() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  console.log('Seeding agent tokens…\n');

  try {
    const results: { label: string; token: string; status: 'created' | 'exists' }[] = [];

    for (const agent of AGENTS) {
      // Check if a non-revoked token with this label already exists
      const existing = await client.query(
        `SELECT token FROM admin_tokens WHERE label = $1 AND revoked_at IS NULL LIMIT 1`,
        [agent.label]
      );

      if (existing.rows.length > 0) {
        results.push({ label: agent.label, token: existing.rows[0].token, status: 'exists' });
        continue;
      }

      // Generate a fresh token
      const token = crypto.randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO admin_tokens (token, label) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING`,
        [token, agent.label]
      );
      results.push({ label: agent.label, token, status: 'created' });
    }

    console.log('='.repeat(72));
    console.log('AGENT TOKENS — save these in each agent\'s identity.md');
    console.log('='.repeat(72));

    for (const r of results) {
      const icon = r.status === 'created' ? '✓ NEW  ' : '· EXIST';
      console.log(`\n${icon} ${r.label}`);
      console.log(`        ${r.token}`);
    }

    console.log('\n' + '='.repeat(72));
    console.log(`Done. ${results.filter(r => r.status === 'created').length} created, ${results.filter(r => r.status === 'exists').length} already existed.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seedAgents().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
