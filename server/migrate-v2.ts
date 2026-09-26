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

/**
 * Module directory under whatever runtime we're in. The CJS esbuild bundle has
 * a native __dirname global but no import.meta; tsx/ESM is the reverse. Both
 * paths are guarded so this can never throw at module load.
 */
const MODULE_DIR: string | null = (() => {
  try {
    if (typeof __dirname !== 'undefined' && __dirname) return __dirname as unknown as string;
  } catch { /* not in CJS */ }
  try {
    const url = (import.meta as { url?: string }).url;
    if (url) return path.dirname(fileURLToPath(url));
  } catch { /* import.meta unavailable */ }
  return null;
})();

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

    const dir = resolveMigrationsDir();
    if (!dir) throw new Error('migrations directory not found (checked cwd/server/migrations, dist/server/migrations, __dirname variants)');
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
    const dir = resolveMigrationsDir();
    if (!dir) {
      console.warn('[pulse] boot migration skipped: migrations directory not found (cwd=' + process.cwd() + ')');
      return;
    }
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(dir, f), 'utf-8'));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function isLocalDb(): boolean {
  return /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
}

/**
 * Locate server/migrations/ regardless of execution context. `__dirname` works
 * under tsx but NOT inside the esbuild CJS bundle (import.meta.url is undefined
 * there), which silently disabled boot migrations on Render. Try explicit
 * candidates from cwd (the deployed checkout keeps server/*.sql on disk) and
 * fall back to __dirname variants for source and bundled layouts.
 */
function resolveMigrationsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), 'server', 'migrations'),
    path.join(process.cwd(), 'dist', 'server', 'migrations'),
    ...(MODULE_DIR ? [
      path.resolve(MODULE_DIR, 'migrations'),
      path.resolve(MODULE_DIR, 'src', 'migrations'),
      path.resolve(MODULE_DIR, '..', 'server', 'migrations'),
    ] : []),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch {
      // keep probing
    }
  }
  return null;
}

// Auto-run only when executed directly as a CLI script (not when imported
// by server/index.ts for migrateOnBoot — that import must never side-effect,
// and the guard itself must never throw: in the esbuild CJS bundle
// import.meta.url is undefined, and a throw here would poison the import
// that index.ts relies on for boot migrations).
function isDirectRun(): boolean {
  try {
    const arg = process.argv[1] ?? '';
    if (!arg) return false;
    const base = arg.split(/[\\/]/).pop() ?? '';
    const url = (import.meta as { url?: string }).url;
    return url ? url.endsWith(base) : false;
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  run().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
}
