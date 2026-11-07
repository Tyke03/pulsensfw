import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryAgentStore } from '../agent/memory-store';
import {
  AgentError,
  affiliateUpsert,
  publishDraft,
  rollbackDraft,
  unpublishDraft,
  upsertDraft,
} from '../agent/service';
import type { AgentAuth } from '../agent/scopes';
import type { DraftState } from '../agent/state';

const draftKey: AgentAuth = { scope: 'draft', keyPrint: 'aaaa-bbbb-cccc' };
const publishKey: AgentAuth = { scope: 'publish', keyPrint: 'dddd-eeee-ffff' };

const articleState: DraftState = {
  kind: 'article',
  slug: 'test-story',
  title: 'Test story',
  dek: 'A test dek.',
  topic: 'sites',
  kind2: 'site_review',
  author: 'QC',
  kicker: 'Review',
  tags: [],
  entities: ['pornhub'],
  cover: { alt: 'Test cover', license: 'own-art', explicit: false },
  images: [],
  sources: [],
  checkedAt: null,
  blocks: [{ type: 'p', text: 'Body paragraph one.' }],
};

describe('agent service — scope enforcement', () => {
  it('rejects draft writes and reads without the drafts key', async () => {
    const store = new MemoryAgentStore();
    await assert.rejects(
      () => upsertDraft(store, publishKey, { idempotencyKey: 'idem-aaaa-bbbb', state: articleState, status: 'draft', note: '', base: null }),
      (error: AgentError) => error.code === 'agent-forbidden',
    );
    await assert.rejects(
      () => upsertDraft(store, null, { idempotencyKey: 'idem-cccc-dddd', state: articleState, status: 'draft', note: '', base: null }),
      (error: AgentError) => error.code === 'agent-unauthenticated',
    );
  });

  it('rejects publish operations with the drafts key', async () => {
    const store = new MemoryAgentStore();
    await assert.rejects(
      () => publishDraft(store, draftKey, { idempotencyKey: 'idem-ffff-9999', slug: 'missing', expectedVersion: 0 }),
       (error: AgentError) => error.code === 'agent-forbidden',
    );
  });
});

describe('agent service — drafts + idempotency', () => {
  it('creates a draft and returns its revision+fingerprint', async () => {
    const store = new MemoryAgentStore();
    const draft = await upsertDraft(store, draftKey, {
      idempotencyKey: 'create-test-story-1',
      state: articleState,
      status: 'draft',
      note: 'first',
      base: null,
    });
    assert.equal(draft.revisionSeq, 1);
    assert.equal(draft.status, 'draft');
    assert.ok(draft.fingerprint.length >= 8);
  });

  it('identical retry replays the stored result without a new revision', async () => {
    const store = new MemoryAgentStore();
    const input = { idempotencyKey: 'retry-same-key-1', state: articleState, status: 'draft' as const, note: 'first', base: null };
    const first = await upsertDraft(store, draftKey, input);
    const second = await upsertDraft(store, draftKey, { ...input });
    assert.deepEqual(
      { seq: second.revisionSeq, status: second.status, fp: second.fingerprint },
      { seq: first.revisionSeq, status: first.status, fp: first.fingerprint },
    );
    const revisions = await store.listRevisions('test-story');
    assert.equal(revisions.length, 1);
  });

  it('reuses a key with different input and fails clearly', async () => {
    const store = new MemoryAgentStore();
    await upsertDraft(store, draftKey, { idempotencyKey: 'conflict-key-1', state: articleState, status: 'draft', note: 'first', base: null });
    await assert.rejects(
      () => upsertDraft(store, draftKey, {
        idempotencyKey: 'conflict-key-1',
        state: { ...articleState, title: 'Different title' },
        status: 'draft',
        note: 'second',
        base: null,
      }),
      (error: AgentError) => error.code === 'idempotency-conflict',
    );
  });

  it('requires an optimistic base on update and rejects stale bases', async () => {
    const store = new MemoryAgentStore();
    const first = await upsertDraft(store, draftKey, {
      idempotencyKey: 'base-create-1',
      state: articleState,
      status: 'draft',
      note: '',
      base: null,
    });
    await assert.rejects(
      () => upsertDraft(store, draftKey, {
        idempotencyKey: 'base-missing-1',
        state: articleState,
        status: 'draft',
        note: 'second',
        base: null,
      }),
      (error: AgentError) => error.code === 'needs-base',
    );
    await assert.rejects(
      () => upsertDraft(store, draftKey, {
        idempotencyKey: 'base-stale-1',
        state: articleState,
        status: 'draft',
        note: 'second',
        base: { revisionSeq: first.revisionSeq, fingerprint: 'wrong-finger-print' },
      }),
      (error: AgentError) => error.code === 'stale-revision',
    );
    const updated = await upsertDraft(store, draftKey, {
      idempotencyKey: 'base-fresh-1',
      state: articleState,
      status: 'in_review',
      note: 'second',
      base: { revisionSeq: first.revisionSeq, fingerprint: first.fingerprint },
    });
    assert.equal(updated.revisionSeq, 2);
    assert.equal(updated.status, 'in_review');
  });
});

describe('agent service — publish lifecycle', () => {
  it('publishes an in-review draft and records it in revisions + audit', async () => {
    const store = new MemoryAgentStore();
    await upsertDraft(store, draftKey, {
      idempotencyKey: 'pub-create-1',
      state: articleState,
      status: 'in_review',
      note: '',
      base: null,
    });
    const publication = await publishDraft(store, publishKey, {
      idempotencyKey: 'pub-publish-1',
      slug: 'test-story',
      expectedVersion: 0,
    });
    assert.equal(publication.status, 'published');
    assert.ok(publication.version > 0);
    const revisions = await store.listRevisions('test-story');
    assert.ok(revisions.at(-1)?.statusAt === 'published');
    const audit = await store.listAudit('test-story');
    assert.ok(audit.some((row) => row.action === 'publish'));
    assert.equal(audit.at(0)?.actorPrint, publishKey.keyPrint);
  });

  it('enforces publish compare-and-set (stale expectedVersion fails with current)', async () => {
    const store = new MemoryAgentStore();
    await upsertDraft(store, draftKey, { idempotencyKey: 'cas-create-1', state: articleState, status: 'in_review', note: '', base: null });
    const first = await publishDraft(store, publishKey, { idempotencyKey: 'cas-publish-1', slug: 'test-story', expectedVersion: 0 });
    await assert.rejects(
      () => publishDraft(store, publishKey, { idempotencyKey: 'cas-publish-2', slug: 'test-story', expectedVersion: 0 }),
      (error: AgentError) =>
        error.code === 'stale-publication' &&
        (error.extra as { current?: { version?: number } }).current?.version === first.version,
    );
  });

  it('publish → unpublish → publish visibility round-trip', async () => {
    const store = new MemoryAgentStore();
    await upsertDraft(store, draftKey, { idempotencyKey: 'vis-create-1', state: articleState, status: 'in_review', note: '', base: null });
    const published = await publishDraft(store, publishKey, { idempotencyKey: 'vis-pub-1', slug: 'test-story', expectedVersion: 0 });
    let visible = await store.listPublishedStates();
    assert.equal(visible.length, 1);
    await unpublishDraft(store, publishKey, { idempotencyKey: 'vis-unpub-1', slug: 'test-story', expectedVersion: published.version });
    visible = await store.listPublishedStates();
    assert.equal(visible.length, 0);
    await assert.rejects(
      () => publishDraft(store, publishKey, { idempotencyKey: 'vis-repub-1', slug: 'test-story', expectedVersion: published.version }),
      (error: AgentError) => error.code === 'stale-publication',
    );
  });

  it('rollback creates a new audited revision and never erases history', async () => {
    const store = new MemoryAgentStore();
    await upsertDraft(store, draftKey, { idempotencyKey: 'rb-create-1', state: articleState, status: 'draft', note: '', base: null });
    const before = (await store.listRevisions('test-story')).length;
    const rolled = await rollbackDraft(store, publishKey, { idempotencyKey: 'rb-rollback-1', slug: 'test-story', toSeq: 1 });
    assert.equal(rolled.status, 'rolled_back');
    const history = await store.listRevisions('test-story');
    assert.equal(history.length, before + 1);
    assert.ok(history.every((row) => history.some((other) => other.seq >= row.seq)));
    const audit = await store.listAudit('test-story');
    assert.ok(audit.some((row) => row.action === 'rollback'));
  });
});

describe('agent service — affiliate queue (draft scope)', () => {
  it('queues metadata and is idempotent by key', async () => {
    const store = new MemoryAgentStore();
    const input = {
      idempotencyKey: 'aff-idem-key-1',
      slug: 'pornhub',
      status: 'active' as const,
      program_name: 'PH program',
      commission: '25%',
    };
    const first = await affiliateUpsert(store, draftKey, input);
    const again = await affiliateUpsert(store, draftKey, { ...input });
    assert.equal(first.reference, again.reference);
    const queue = await store.listAffiliateQueue();
    assert.equal(queue.length, 1);
  });
});
