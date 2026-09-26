/**
 * Test setup: sets env BEFORE importing modules that read DATABASE_URL at
 * import time; provides a fresh-schema helper against the local test Postgres.
 */
process.env.DATABASE_URL ??= 'postgresql://postgres:testpass@127.0.0.1:5433/pulsensfw_test';
process.env.ORCHESTRATOR_MODE ??= 'shadow';
process.env.LOVENSE_LINKS_PATH ??= 'user_supplied/affiliates/lovense-links.json';

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
export const testDb = drizzle(testPool, { schema });

/** Apply base legacy tables + all additive migrations; truncate everything. */
export async function freshSchema() {
  const client = await testPool.connect();
  try {
    // legacy base tables (mirrors migrate-v2's defensive block)
    await client.query(`CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL DEFAULT '', excerpt TEXT, category VARCHAR(50) NOT NULL,
      tags TEXT[] DEFAULT '{}', affiliate_links JSONB DEFAULT '[]',
      meta_title TEXT, meta_description TEXT, featured_image TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      qc_status TEXT DEFAULT 'pending', qc_notes TEXT, research_source TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS affiliates (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
      category VARCHAR(50), description TEXT, commission_notes TEXT,
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(),
      tracking_status TEXT DEFAULT 'unverified', signup_url TEXT,
      commission_rate TEXT, notes TEXT)`);
    const dir = path.resolve(process.cwd(), 'server/migrations');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(dir, f), 'utf-8'));
    }
    // clean all tables between tests (tolerate missing legacy tables)
    for (const t of ['orchestration_events', 'publish_decisions', 'affiliate_health_checks',
      'end_rail_plans', 'media_assets', 'review_escalations', 'agent_leases', 'agent_runs',
      'work_items', 'agent_instructions', 'posts', 'affiliates', 'site_config', 'admin_tokens', 'analytics']) {
      const exists = await client.query(`SELECT to_regclass('public.${t}') AS reg`);
      if (exists.rows[0]?.reg) await client.query(`TRUNCATE ${t} CASCADE`);
    }
  } finally {
    client.release();
  }
}

export async function closePool() {
  await testPool.end();
}
