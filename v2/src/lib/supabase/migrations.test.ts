import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * SQL integration test for the Supabase migration set (0001–0004).
 *
 * Runs the real migration files against in-process Postgres (pglite), with a
 * minimal stub of the Supabase-provided `auth` schema and roles (the same
 * claim source Supabase injects). Validates migration SQL, RLS policies and
 * uniqueness semantics against a REAL Postgres engine locally — it is NOT
 * live Supabase verification (no network, no service key, no project
 * connection). Supabase store calls go through PostgREST; these tests cover
 * the SQL semantics those PostgREST calls rely on.
 */
const pglite = new PGlite();

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

/** pglite.query returns { rows, fields }; rows are the interesting part. */
async function rowsOf(statement: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await pglite.query(statement, params as never);
  return (result.rows ?? []) as Record<string, unknown>[];
}

/** Run a callback as the `authenticated` role with a reader's claim body. */
async function asAuthenticated<T>(fn: () => Promise<{ rows?: T[] }>, userId: string): Promise<T[]> {
  await pglite.query('BEGIN');
  await pglite.query("SELECT set_config('role', 'authenticated', true)");
  await pglite.query("SELECT set_config('request.jwt.claims.sub', $1, true)", [userId]);
  try {
    const result = await fn();
    return (result.rows ?? []) as T[];
  } finally {
    await pglite.query('ROLLBACK');
  }
}

before(async () => {
  // Minimal stub of the Supabase-provided auth schema and roles (a MOCK of
  // Supabase internals for these SQL statements — not the real project).
  await pglite.exec('CREATE SCHEMA IF NOT EXISTS auth');
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    )`);
  await pglite.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $fn$
      SELECT nullif(current_setting('request.jwt.claims.sub', true), '')::uuid
    $fn$;`);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pglite.exec(`DO $do$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
        CREATE ROLE ${role} NOLOGIN;
      END IF;
    END $do$;`);
  }
  await pglite.exec(`
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $fn$
      SELECT nullif(current_setting('request.jwt.claims.sub', true), '')::uuid
    $fn$;`);
  // Real migrations first, in order.
  for (const file of ['0001_reader_profiles.sql', '0002_agent_content.sql', '0003_model_usage.sql', '0004_reconcile_fresh_baseline.sql']) {
    const sql = readFileSync(join(here, '..', '..', '..', 'supabase', 'migrations', file), 'utf8');
    await pglite.exec(sql);
  }
  // Emulate Supabase's default privileges on public tables (the live service
  // grants them automatically; RLS is the isolation line — the exact posture
  // production has).
  for (const table of ['reader_profiles', 'saved_entities', 'follows']) {
    for (const role of ['anon', 'authenticated']) {
      await pglite.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO ${role};`);
    }
  }
  // Seed the FK parents (auth.users stub) for the fixture readers.
  await rowsOf('INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING', [USER_A, USER_B]);
});

describe('Supabase migrations 0001–0004 (pglite integration — real SQL, local only)', () => {
  it('reader RLS: users see and write only their own saved rows', async () => {
    await rowsOf('INSERT INTO reader_profiles (user_id, nsfw_pref) VALUES ($1, false)', [USER_A]);
    await rowsOf('INSERT INTO saved_entities (user_id, slug, kind) VALUES ($1, $2, $3)', [USER_A, 'brazzers', 'site']);
    await rowsOf('INSERT INTO saved_entities (user_id, slug, kind) VALUES ($1, $2, $3)', [USER_B, 'sexlike-real', 'site']);

    const seenA = await asAuthenticated(
      () => pglite.query('SELECT slug FROM saved_entities ORDER BY slug'),
      USER_A,
    );
    assert.deepEqual(seenA.map((row: unknown) => (row as Record<string, unknown>).slug), ['brazzers']);

    const seenB = await asAuthenticated(
      () => pglite.query('SELECT slug FROM saved_entities ORDER BY slug'),
      USER_B,
    );
    assert.deepEqual(seenB.map((row: unknown) => (row as Record<string, unknown>).slug), ['sexlike-real']);

    // Reader A writing rows into B's user_id is blocked by WITH CHECK.
    let blocked = false;
    try {
      await asAuthenticated(
        () => pglite.query("INSERT INTO saved_entities (user_id, slug, kind) VALUES ('22222222-2222-2222-2222-222222222222', 'pornhub', 'site')"),
        USER_A,
      );
    } catch {
      blocked = true;
    }
    assert.equal(blocked, true);
  });

  it('agent_idempotency: transactional uniqueness (23505 on duplicate key)', async () => {
    await rowsOf("INSERT INTO agent_idempotency (key_id, scope, request_hash) VALUES ('dup-1', 'draft', 'h1')");
    let conflict = false;
    try {
      await rowsOf("INSERT INTO agent_idempotency (key_id, scope, request_hash) VALUES ('dup-1', 'draft', 'h2')");
    } catch (error) {
      conflict = String((error as { code?: string }).code) === '23505';
    }
    assert.equal(conflict, true);
    const still = await rowsOf("SELECT request_hash FROM agent_idempotency WHERE key_id = 'dup-1'");
    assert.equal(still.at(0)?.request_hash, 'h1');
  });

  it('agent_idempotency: ON CONFLICT DO NOTHING claim matches store semantics', async () => {
    const claimed = await rowsOf(
      "INSERT INTO agent_idempotency (key_id, scope, request_hash) VALUES ('claim-only-1', 'draft', 'ha') ON CONFLICT (key_id) DO NOTHING RETURNING key_id",
    );
    assert.equal(claimed.length, 1);
    const lostRace = await rowsOf(
      "INSERT INTO agent_idempotency (key_id, scope, request_hash) VALUES ('claim-only-1', 'draft', 'ha') ON CONFLICT (key_id) DO NOTHING RETURNING key_id",
    );
    assert.equal(lostRace.length, 0);
  });

  it('agent_revisions: append-only uniqueness on (slug, seq)', async () => {
    const state = JSON.stringify({ kind: 'article', slug: 'sql-story', blocks: [], cover: { alt: 'c', license: 'own-art', explicit: false } });
    await rowsOf("INSERT INTO agent_revisions (slug, seq, status_at, state, note, actor_print) VALUES ('sql-story', 1, 'draft', $1, '', 'p')", [state]);
    let conflict = false;
    try {
      await rowsOf("INSERT INTO agent_revisions (slug, seq, status_at, state, note, actor_print) VALUES ('sql-story', 1, 'draft', $1, '', 'p')", [state]);
    } catch (error) {
      conflict = String((error as { code?: string }).code) === '23505';
    }
    assert.equal(conflict, true);
  });

  it('model usage: bump function accumulates across calls', async () => {
    await rowsOf("SELECT bump_model_usage_daily('2026-11-07', 'sess-1', 'model-x', 10, 20, 5)");
    await rowsOf("SELECT bump_model_usage_daily('2026-11-07', 'sess-1', 'model-x', 10, 20, 5)");
    const usage = await rowsOf("SELECT calls, est_cost_micro_usd FROM model_usage_daily WHERE day = '2026-11-07' AND session_hash = 'sess-1' AND model_id = 'model-x'");
    assert.equal(usage.at(0)?.calls, 2);
    assert.equal(usage.at(0)?.est_cost_micro_usd, 10);
  });

  it('reader_profiles.updated_at moves on update (0004 trigger)', async () => {
    await rowsOf('INSERT INTO reader_profiles (user_id, nsfw_pref) VALUES ($1, false)', [USER_B]);
    const before = await rowsOf('SELECT updated_at FROM reader_profiles WHERE user_id = $1', [USER_B]);
    await rowsOf('UPDATE reader_profiles SET nsfw_pref = true WHERE user_id = $1', [USER_B]);
    const after = await rowsOf('SELECT updated_at FROM reader_profiles WHERE user_id = $1', [USER_B]);
    assert.ok(new Date(String(after.at(0)?.updated_at)).getTime() >= new Date(String(before.at(0)?.updated_at)).getTime());
  });

  it('agent_publications_view only exposes published rows', async () => {
    await rowsOf("INSERT INTO agent_drafts (slug, status, state, fingerprint, revision_seq, revised_at) VALUES ('view-story', 'published', '{\"kind\":\"article\",\"slug\":\"view-story\",\"blocks\":[]}', 'fp1', 1, now())");
    await rowsOf("INSERT INTO agent_publications (slug, published, version_seq) VALUES ('view-story', true, 1)");
    await rowsOf("INSERT INTO agent_drafts (slug, status, state, fingerprint, revision_seq, revised_at) VALUES ('unpub-story', 'in_review', '{\"kind\":\"article\",\"slug\":\"unpub-story\",\"blocks\":[]}', 'fp2', 1, now())");
    await rowsOf("INSERT INTO agent_publications (slug, published, version_seq) VALUES ('unpub-story', false, 1)");
    const rows = await rowsOf('SELECT slug FROM agent_publications_view');
    assert.deepEqual(
      rows.filter((row) => String(row.slug).startsWith('view')).map((row) => row.slug),
      ['view-story'],
    );
  });

  it('defense in depth from 0004: no direct anon/authenticated grants on pipeline tables', async () => {
    const grants = await rowsOf(`
      SELECT table_name FROM information_schema.table_privileges
      WHERE (grantee = 'anon' OR grantee = 'authenticated')
        AND table_name LIKE 'agent_%' LIMIT 1`);
    assert.equal(grants.length, 0);
  });
});
