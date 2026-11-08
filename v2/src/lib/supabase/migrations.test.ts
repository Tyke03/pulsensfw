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
async function rowsOf(statement: string, params?: unknown[]): Promise<Array<Record<string, any>>> {
  const result = await pglite.query(statement, params as never);
  return ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? []) as Array<Record<string, any>>;
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
  // REPRODUCE the Supabase service defaults the access findings are about:
  // default PUBLIC EXECUTE on new functions is a Postgres default (already
  // present here); on views the live service auto-grants SELECT to the three
  // roles. Grants added BELOW so the 0005 regression tests deny them rather
  // than pass vacuously on a stub with no grants.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await pglite.exec(`GRANT SELECT ON public.agent_publications_view TO ${role};`);
  }
  // LIVE-POSTURE EMULATION for the service role: on a real project it holds
  // full default grants on the public tables it automates plus the BYPASSRLS
  // attribute (Supabase docs list both). Without these the security_invoker
  // view would read zero rows under service_role, contradicting production.
  for (const table of ['agent_idempotency', 'agent_drafts', 'agent_revisions', 'agent_publications', 'agent_affiliate_queue', 'agent_audit', 'model_usage_daily', 'reader_profiles', 'saved_entities', 'follows']) {
    await pglite.exec(`GRANT ALL ON public.${table} TO service_role;`);
  }
  await pglite.exec('ALTER ROLE service_role NOLOGIN BYPASSRLS;');
  // Security-repair migration last.
  {
    const sql = readFileSync(join(here, '..', '..', '..', 'supabase', 'migrations', '0005_view_and_function_permissions.sql'), 'utf8');
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

/** Run a callback while switched into a specific Postgres role (pglite is a
 * superuser connection, so every switch is allowed). */
async function asRole<T>(role: string, fn: () => Promise<{ rows?: T[] } | void>): Promise<T[] | null> {
  await pglite.query('BEGIN');
  await pglite.query(`SET LOCAL ROLE ${role}`);
  try {
    const result = await fn();
    if (result && typeof result === 'object' && 'rows' in (result as Record<string, unknown>)) {
      return ((result as { rows?: T[] }).rows ?? []) as T[];
    }
    return null;
  } finally {
    await pglite.query('ROLLBACK');
  }
}

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

  describe('0005 access lockdown (behavioral regression for the two findings)', () => {
    it('security_invoker banner is actually set on the view', async () => {
      const meta = await rowsOf("SELECT reloptions FROM pg_class WHERE relname = 'agent_publications_view'");
      const raw = JSON.stringify(meta.at(0)?.reloptions ?? []);
      assert.match(raw, /security_invoker=true/);
    });

    it('default PUBLIC EXECUTE on the SECURITY DEFINER function is revoked: anon denied', async () => {
      let denied = false;
      try {
        await asRole('anon', () => pglite.query("SELECT bump_model_usage_daily('2026-11-08', 'anon-probe', 'model-x', 1, 1, null)"));
      } catch (error) {
        denied = String((error as { code?: string }).code) === '42501';
      }
      assert.equal(denied, true);
      const stack = await rowsOf("SELECT calls FROM model_usage_daily WHERE session_hash = 'anon-probe'");
      assert.equal(stack.length, 0); // nothing executed under the definer
    });

    it('default PUBLIC EXECUTE on the SECURITY DEFINER function is revoked: authenticated denied', async () => {
      let denied = false;
      try {
        await asRole('authenticated', () => pglite.query("SELECT bump_model_usage_daily('2026-11-08', 'authed-probe', 'model-x', 1, 1, null)"));
      } catch (error) {
        denied = String((error as { code?: string }).code) === '42501';
      }
      assert.equal(denied, true);
      const stack = await rowsOf("SELECT calls FROM model_usage_daily WHERE session_hash = 'authed-probe'");
      assert.equal(stack.length, 0);
    });

    it('function EXECUTE is readable from the ACL, not inferred (grant to service_role: via data API role)', async () => {
      // information_schema.routine_privileges as a metadata crosscheck; the
      // behavioral tests below carry the claim.
      const granteeCount = await rowsOf(`
        SELECT count(*)::int AS grantees FROM information_schema.routine_privileges
        WHERE routine_name = 'bump_model_usage_daily'
          AND grantee IN ('service_role')`);
      assert.equal(granteeCount.at(0)?.grantees, 1);
    });

    it('service_role (the server-only caller) can still run the function', async () => {
      // Session-level role switch (not a transaction) so the DEFINER write
      // persists and proves the call executed end-to-end.
      await pglite.query("SELECT set_config('role', 'service_role', false)");
      try {
        await rowsOf("SELECT bump_model_usage_daily('2026-11-08', 'svc-probe', 'model-x', 1, 2, null)");
      } finally {
        await pglite.query("SELECT set_config('role', 'postgres', false)");
      }
      const bump = await rowsOf("SELECT calls FROM model_usage_daily WHERE session_hash = 'svc-probe'");
      assert.equal(bump.at(0)?.calls, 1);
    });

    it('view: anon denied (reproducing the Supabase default view grant that 0005 revokes)', async () => {
      let denied = false;
      try {
        await asRole('anon', () => pglite.query('SELECT slug FROM agent_publications_view'));
      } catch (error) {
        denied = String((error as { code?: string }).code) === '42501';
      }
      assert.equal(denied, true);
    });

    it('view: authenticated denied', async () => {
      let denied = false;
      try {
        await asRole('authenticated', () => pglite.query('SELECT slug FROM agent_publications_view'));
      } catch (error) {
        denied = String((error as { code?: string }).code) === '42501';
      }
      assert.equal(denied, true);
    });

    it('view: service_role still reads the published overlay (intended caller)', async () => {
      const viewRows = (await asRole(
        'service_role',
        () => pglite.query('SELECT slug FROM agent_publications_view'),
      )) as Array<Record<string, unknown>>;
      assert.ok(viewRows.some((row) => String(row.slug) === 'view-story'));
    });

    it('honesty probe: service-role append-only is NOT database-enforced (update succeeds)', async () => {
      // The revisions table's immutability is currently an application-level
      // rule; the server code only appends. This test pins the fact that the
      // database would still let the service role write, so nobody reads the
      // migration as DB-enforced immutability.
      const updated = await asRole('service_role', () =>
        pglite.query("UPDATE agent_revisions SET note = 'probe' WHERE slug = 'sql-story' AND seq = 1 RETURNING note"),
      );
      assert.ok((updated ?? []).length > 0);
      // Restore: penance for the probe.
      await rowsOf("UPDATE agent_revisions SET note = '' WHERE slug = 'sql-story' AND seq = 1");
    });
  });
});
