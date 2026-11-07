import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { NeonAgentStore } from './neon-store';
import {
  publishDraft,
  rollbackDraft,
  upsertDraft,
} from '../agent/service';
import type { AgentAuth } from '../agent/scopes';
import type { DraftState } from '../agent/state';
import type { PGRunner } from '../db/pg';
import {
  listReaderFollows,
  getReaderProfile,
  listReaderSaved,
  removeReaderSaved,
  upsertReaderFollow,
  upsertReaderProfile,
  upsertReaderSaved,
} from '../auth/reader-store';

const here = dirname(fileURLToPath(import.meta.url));

const pglite = new PGlite();

/** pglite backend through the SAME PGRunner interface Neon uses in prod. */
const runner: PGRunner = {
  query: async (statement, params = []) => {
    const result = await pglite.query(statement, params as never);
    return (result.rows ?? []) as Record<string, unknown>[];
  },
  async transaction(statements) {
    return pglite.transaction(async (tx) => {
      const out: Record<string, unknown>[][] = [];
      for (const { statement, params } of statements) {
        const result = await tx.query(statement, params ?? []);
        out.push((result.rows ?? []) as Record<string, unknown>[]);
      }
      return out;
    });
  },
};

before(async () => {
  const sql = readFileSync(join(here, '../../../neon/migrations/0001_app_current_baseline.sql'), 'utf8');
  await pglite.exec(sql);
});

const draftKey: AgentAuth = { scope: 'draft', keyPrint: 'aaaa-1111' };
const publishKey: AgentAuth = { scope: 'publish', keyPrint: 'bbbb-2222' };

const articleState: DraftState = {
  kind: 'article',
  slug: 'pg-smoke-story',
  title: 'Postgres-backed store test',
  dek: 'Full lifecycle against real SQL.',
  topic: 'sites',
  kind2: 'site_review',
  author: 'QC',
  kicker: 'Review',
  tags: [],
  entities: [],
  cover: { alt: 'Cover', license: 'own-art', explicit: false },
  images: [],
  sources: [],
  checkedAt: null,
  blocks: [{ type: 'p', text: 'SQL-backed body.' }],
};

describe('Neon agent store (pglite integration — real SQL, local file only)', () => {
  it('applies the baseline migration cleanly (views/tables exist)', async () => {
    const rows = await runner.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'agent_revisions'");
    assert.equal(rows.length, 1);
  });

  it('full lifecycle: draft → publish → visible → rollback keeps history + hidden', async () => {
    const store = new NeonAgentStore(runner);
    await upsertDraft(store, draftKey, { idempotencyKey: 'pg-create-1', state: articleState, status: 'in_review', note: '', base: null });
    const published: { status: string; version: number } = await publishDraft(store, publishKey, { idempotencyKey: 'pg-pub-1', slug: 'pg-smoke-story', expectedVersion: 0 });
    assert.equal(published.status, 'published');
    const visible = await store.listPublishedStates();
    assert.equal(visible.length, 1);
    assert.equal(visible[0].slug, 'pg-smoke-story');
    const rolled = await rollbackDraft(store, publishKey, { idempotencyKey: 'pg-rollback-1', slug: 'pg-smoke-story', toSeq: 1 }) as { status: string };
    assert.equal(rolled.status, 'rolled_back');
    const after = await store.listPublishedStates();
    assert.equal(after.length, 0);
    const history = await store.listRevisions('pg-smoke-story');
    assert.deepEqual(history.map((row) => row.seq), [1, 2, 3]);
  });

  it('idempotency: identical claims replay; conflicting payloads fail loudly', async () => {
    const store = new NeonAgentStore(runner);
    const first = await store.claimIdempotency('pg-idem-a', 'hash-a', 'draft');
    assert.equal(first.status, 'free');
    const replay = await store.claimIdempotency('pg-idem-a', 'hash-a', 'draft');
    assert.equal(replay.status, 'conflict-inflight');
    await store.storeIdempotent('pg-idem-a', 'hash-a', 'draft', { done: true });
    const stored = await store.claimIdempotency('pg-idem-a', 'hash-a', 'draft');
    assert.equal(stored.status, 'stored');
    const conflict = await store.claimIdempotency('pg-idem-b', 'hash-x', 'draft');
    await store.claimIdempotency('pg-idem-b', 'hash-y', 'draft');
    assert.equal(conflict.status, 'free');
    const conflicting = await store.claimIdempotency('pg-idem-b', 'hash-y2', 'draft');
    assert.equal(conflicting.status, 'conflict-current');
    const otherScope = await store.claimIdempotency('pg-idem-a', 'hash-a', 'publish');
    assert.equal(otherScope.status, 'conflict-current');
  });

  it('reader isolation: writes scoped by user_id stay invisible to other ids', async () => {
    await upsertReaderProfile(runner, 'user-a-1', true);
    await upsertReaderSaved(runner, 'user-a-1', 'brazzers', 'site');
    await upsertReaderFollow(runner, 'user-a-1', 'angela-white', 'star');
    const bSaved = await listReaderSaved(runner, 'user-b-1');
    assert.equal(bSaved.length, 0);
    const bFollows = await listReaderFollows(runner, 'user-b-1');
    assert.equal(bFollows.length, 0);
    const aSaved = await listReaderSaved(runner, 'user-a-1');
    assert.deepEqual(aSaved.map((row) => row.slug), ['brazzers']);
    await removeReaderSaved(runner, 'user-a-1', 'brazzers');
    assert.equal((await listReaderSaved(runner, 'user-a-1')).length, 0);
  });

  it('profile upsert updates the same row only', async () => {
    await upsertReaderProfile(runner, 'user-c-1', false);
    await upsertReaderProfile(runner, 'user-c-1', true);
    const profile = await getReaderProfile(runner, 'user-c-1');
    assert.equal(profile?.nsfw_pref, true);
    const bProfile = await getReaderProfile(runner, 'user-b-1');
    assert.equal(bProfile, null);
  });
});
