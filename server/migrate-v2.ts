/**
 * migrate-v2.ts — runs additive SQL migrations from server/migrations/*.sql
 * Usage: DATABASE_URL=... npx tsx server/migrate-v2.ts
 * Idempotent: every statement uses IF NOT EXISTS. Rollback notes per file.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isLocalDb() ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // Ensure the legacy tables exist first so FK references in 001 resolve on
    // fresh databases; on live Neon these are no-ops.
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

    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      console.log(`  applying ${f} ...`);
      await client.query(fs.readFileSync(path.join(dir, f), 'utf-8'));
      console.log(`  ok ${f}`);
    }
    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

/** Boot-time migration hook: non-fatal on failure (all statements are additive). */
export async function migrateOnBoot(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isLocalDb() ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // Ensure legacy base tables exist so additive FK references resolve on fresh DBs.
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
    const dir = path.join(__dirname, 'migrations');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf-8'));
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function isLocalDb(): boolean {
  return /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
}

// Auto-run only when executed directly as a CLI script (not when imported
// by server/index.ts for migrateOnBoot — that import must never side-effect).
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? '');
if (isDirectRun) {
  run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
}
