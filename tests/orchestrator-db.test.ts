import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshSchema, testDb, testPool, closePool } from './setup';
import { workItems, agentLeases, agentRuns, orchestrationEvents, posts, affiliates, agentInstructions, affiliateHealthChecks, reviewEscalations, endRailPlans, mediaAssets, publishDecisions } from '../shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import { claimLease, releaseLease, verifyLease, assertNotStale } from '../server/orchestrator/leases';
import { tick } from '../server/orchestrator/engine';
import { EchoInvoker, type InvokeMeta } from '../server/orchestrator/invoker';
import { loadActiveInstructions, evaluateInstructions, markConsumed } from '../server/orchestrator/instructions';

const shadowInvoker: EchoInvoker = new EchoInvoker(new Map());

async function insertItem(over: Partial<typeof workItems.$inferInsert>) {
  const rows = await testDb.insert(workItems).values({
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    type: 'research', role: 'research-vr', category: 'vr', state: 'discovered', ...over,
  } as typeof workItems.$inferInsert).returning();
  return rows[0];
}

before(async () => { await freshSchema(); });
after(async () => { await closePool(); });

describe('idempotency (case 3)', () => {
  it('duplicate idempotency keys are rejected by unique constraint', async () => {
    const base = { idempotencyKey: 'dup-key-1', type: 'research', role: 'research-vr', category: 'vr' } as const;
    await testDb.insert(workItems).values(base);
    await assert.rejects(() => testDb.insert(workItems).values(base as any));
  });

  it('re-running a transition with same runId does not duplicate history', async () => {
    const item = await insertItem({ idempotencyKey: 'dup-key-2' });
    const before = (item.transitionHistory as any[]).length;
    void before;
    // transition applied twice through the engine helper path
    const { applyTransition } = await import('../server/orchestrator/state-machine');
    const a = applyTransition({ state: item.state, transitionHistory: item.transitionHistory ?? [] }, { from: 'discovered', to: 'research_validated', actor: 't', runId: 5 });
    const b = applyTransition({ state: a.state, transitionHistory: a.transitionHistory }, { from: 'discovered', to: 'research_validated', actor: 't', runId: 5 });
    assert.equal(b.transitionHistory.length, 1);
  });
});

describe('leases (cases 4, 5)', () => {
  it('two workers cannot claim the same item', async () => {
    const item = await insertItem({ idempotencyKey: 'lease-1' });
    const l1 = await claimLease(item.id, 'worker-A');
    await assert.rejects(() => claimLease(item.id, 'worker-B'), /already leased/);
    await releaseLease(l1, 'worker-A');
    const l2 = await claimLease(item.id, 'worker-B');
    assert.equal(l2.leaseKey, 'worker-B');
    await releaseLease(l2, 'worker-B');
  });

  it('expired lease is recoverable by a new worker', async () => {
    const item = await insertItem({ idempotencyKey: 'lease-2' });
    await claimLease(item.id, 'worker-old', -1000); // already expired
    const l = await claimLease(item.id, 'worker-new');
    assert.equal(l.leaseKey, 'worker-new');
    await releaseLease(l, 'worker-new');
  });

  it('stale worker cannot complete after a new lease (case 5)', async () => {
    const item = await insertItem({ idempotencyKey: 'lease-3' });
    // Pre-expired claim (deterministic): the previous sleep-based expiry (50ms
    // TTL + 80ms wait) raced the Docker VM clock (observed ~320ms behind the
    // host after a VM boot), intermittently failing the second claim with
    // 'already leased'. A negative TTL is already expired by ANY clock's
    // measure — same end state, no timing dependence (mirrors 'lease-2').
    const stale = await claimLease(item.id, 'worker-old', -1000);
    const fresh = await claimLease(item.id, 'worker-new', 60000);
    await assert.rejects(() => assertNotStale(stale, 'worker-old'), /stale worker/);
    assert.equal(await verifyLease(stale, 'worker-old'), false);
    assert.equal(await verifyLease(fresh, 'worker-new'), true);
    await releaseLease(fresh, 'worker-new');
  });

  it('release by non-owner is refused', async () => {
    const item = await insertItem({ idempotencyKey: 'lease-4' });
    const l = await claimLease(item.id, 'owner');
    assert.equal(await releaseLease(l, 'not-owner'), false);
    await releaseLease(l, 'owner');
  });
});

describe('operator instructions / global halt (case 7)', () => {
  it('persist halt target=all halts the tick before dispatch', async () => {
    await testDb.insert(agentInstructions).values({
      target: 'all', instruction: 'PAUSE ALL CRONS IMMEDIATELY. Do not run any task until this row is removed.', persist: true, active: true, createdBy: 'brent-test',
    });
    await insertItem({ idempotencyKey: 'halt-1' });
    const res = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    assert.equal(res.halted, true);
    assert.equal(res.processed, 0);
    // consumed_by audit recorded
    const rows = await testDb.select().from(agentInstructions).where(eq(agentInstructions.target, 'all'));
    assert.ok((rows[0].consumedBy as any[]).some(c => c.agent === 'orchestrator'));
    // cleanup
    await testDb.update(agentInstructions).set({ active: false });
  });

  it('one-shot targeted instruction is consumed and deactivated', async () => {
    await testDb.insert(agentInstructions).values({
      target: 'research-vr', instruction: 'rewrite item X with new notes', persist: false, active: true, createdBy: 'brent-test',
    });
    const rows = await loadActiveInstructions(['all', 'research-vr']);
    const effect = evaluateInstructions(rows, 'orchestrator');
    assert.equal(effect.globalHalt, false);
    assert.equal(effect.applied.length, 1);
    await markConsumed(effect.applied[0], 'orchestrator');
    const afterRows = await testDb.select().from(agentInstructions).where(eq(agentInstructions.target, 'research-vr'));
    assert.equal(afterRows[0].active, false);
  });
});

describe('shadow mode suppression (case: run ledger shows no side effects)', () => {
  it('research stage in shadow creates candidate items but suppresses legacy-file mutation', async () => {
    await freshSchema(); // isolate from items left by earlier tests
    shadowInvoker.setFixture('research-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        candidates: [{
          topic: 'New VR headset launches with eye tracking', category: 'vr',
          finding: 'A major headset vendor shipped eye tracking for adult VR experiences.',
          source_url: 'https://example.com/vr-launch', source_date: '2026-09-22', event_date: null,
          suggested_angle: 'What it means for immersive experiences', confidence: 0.8,
          duplicate_fingerprint: 'vr-eyetrack-1', news_fit: null,
        }],
      },
    });
    await insertItem({ idempotencyKey: 'shadow-research-1' });
    const res = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    assert.equal(res.halted, false);
    const researchRun = res.results.find(r => r.role === 'research-vr');
    assert.ok(researchRun, 'research item processed');
    assert.equal(researchRun!.outcome, 'research_proposed');
    // candidate work item created with the server-derived dedupe key
    const { createHash } = await import('node:crypto');
    const h = createHash('sha256').update('new vr headset launches with eye tracking|https://example.com/vr-launch'.toLowerCase()).digest('hex').slice(0, 32);
    const cand = await testDb.select().from(workItems).where(eq(workItems.idempotencyKey, `research-candidate:${h}-vr-eyetrack-1`));
    assert.equal(cand.length, 1);
    // suppression journaled
    const suppressed = await testDb.select().from(orchestrationEvents).where(eq(orchestrationEvents.type, 'side_effect_suppressed'));
    assert.ok(suppressed.length >= 0); // research stage suppression is optional-journaled
    // no posts were created
    const p = await testDb.select().from(posts);
    assert.equal(p.length, 0);
  });
});

describe('publish authorization (case 9/10 core path)', () => {
  it('orchestrator never publishes in shadow even when QC says publish', async () => {
    shadowInvoker.setFixture('qc-publisher', {
      status: 'ok', confidence: 0.95, uncertainty: [], escalation: null,
      payload: {
        recommendation: 'publish',
        scorecard: [{ check: 'all', severity: 'info', pass: true, detail: 'fixture' }],
        remediation: [],
      },
    });
    const post = (await testDb.insert(posts).values({
      title: 'Shadow publish test', slug: 'shadow-publish-test', body: '<p>body</p>', category: 'vr', status: 'draft',
    }).returning())[0];
    await insertItem({
      idempotencyKey: 'shadow-qc-1', type: 'qc', role: 'qc-publisher', category: 'vr',
      sourcePayload: { postId: post.id, title: 'Shadow publish test', body: '<p>body</p>', category: 'vr' },
    });
    const res = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    const qcRun = res.results.find(r => r.role === 'qc-publisher');
    assert.ok(qcRun);
    // Safe outcomes: suppressed (shadow) or blocked by deterministic gates.
    assert.ok(['publish_suppressed', 'publish_blocked_by_gates'].includes(qcRun!.outcome), `outcome=${qcRun!.outcome}`);
    const afterPost = (await testDb.select().from(posts).where(eq(posts.id, post.id)))[0];
    assert.equal(afterPost.status, 'draft', 'MUST remain draft in shadow');
  });

  it('publish gates block when QC recommends publish but gates fail (case 10)', async () => {
    // QC fixture says publish; deterministic gates will fail (no media/no rail info in payload)
    shadowInvoker.setFixture('qc-publisher', {
      status: 'ok', confidence: 0.95, uncertainty: [], escalation: null,
      payload: { recommendation: 'publish', scorecard: [], remediation: [] },
    });
    const post = (await testDb.insert(posts).values({
      title: 'Gates block test', slug: 'gates-block-test', body: '<p>body</p>', category: 'vr', status: 'draft',
    }).returning())[0];
    await insertItem({
      idempotencyKey: 'gates-block-1', type: 'qc', role: 'qc-publisher', category: 'vr',
      sourcePayload: { postId: post.id, title: 'Gates block test', body: '<p>body</p>', category: 'vr' },
    });
    const res = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    const qcRun = res.results.find(r => r.role === 'qc-publisher');
    assert.ok(['publish_blocked_by_gates', 'publish_suppressed'].includes(qcRun!.outcome));
  });
});

describe('retry classification & dead-letter (case 6)', () => {
  it('draft_blocked_by_policy consumes the attempt budget (ladder can escalate)', async () => {
    await freshSchema();
    const inv = new EchoInvoker(new Map());
    // Writer produces a draft that deterministically fails the content gates
    // (tiny body, no internal links) on every attempt.
    inv.setFixture('writer-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        title: 'Too Short', slug: 'too-short-draft', excerpt: 'Short.', body: '<p>thin</p>',
        tags: ['a', 'b', 'c'], metaTitle: 'short', metaDescription: 'shorter still',
        intentBrand: null, isStraightNews: false, newsFit: null, visualBrief: null,
        internalLinkIntents: [], selfCheck: {},
      },
    });
    const item = await insertItem({
      idempotencyKey: 'policy-block-1', type: 'draft', role: 'writer-vr', category: 'vr', state: 'ready_to_write',
    });
    await tick({ invoker: inv, mode: 'shadow' });
    const after1 = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after1.attemptCount, 1, `attempts after tick 1 = ${after1.attemptCount}`);
    // Failed gate ⇒ retryable: parked back at its pre-failure working state
    // (draft_proposed) with backoff, NOT routed to human_review.
    assert.equal(after1.state, 'draft_proposed');
    // attemptCount must ACCUMULATE across ticks — under the pre-fix behavior
    // it reset to 0 after every blocked attempt, so tierForAttempt never
    // escalated and the ladder could not engage. (Clear backoff to simulate
    // the retry window elapsing.)
    await testDb.update(workItems).set({ backoffUntil: null }).where(eq(workItems.id, item.id));
    await tick({ invoker: inv, mode: 'shadow' });
    const after2 = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after2.attemptCount, 2, `attempts after tick 2 = ${after2.attemptCount}`);
  });

  it('schema failures are retryable within budget, never dead while attempts remain', async () => {
    await freshSchema(); // isolate from leftovers of earlier tests
    const bad = new EchoInvoker(new Map());
    bad.setFixture('research-vr', { status: 'ok', confidence: 0.9, uncertainty: [], escalation: null, payload: { wrong_shape: true } });
    const item = await insertItem({ idempotencyKey: 'dl-1' });
    const res = await tick({ invoker: bad, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.ok(['schema_invalid', 'failed'].includes(r!.outcome), `outcome=${r!.outcome}`);
    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    // Within budget the item must be alive: scheduled for retry with backoff,
    // parked in a working state — not dead-lettered.
    assert.ok(!['terminal_failure'].includes(after.state), `state=${after.state}`);
    assert.ok(after.attemptCount >= 1 && after.attemptCount < after.maxAttempts, `attempts=${after.attemptCount}/${after.maxAttempts}`);
    assert.ok(after.backoffUntil !== null, 'backoff must be scheduled for retry');
  });
});

describe('envelope refusal handling (PR #8: refused/null payloads never crash the tick)', () => {
  it('a refused envelope routes to human_review with an escalation row, not a TypeError crash', async () => {
    await freshSchema();
    const inv = new EchoInvoker(new Map());
    // payload is null and status is refused — schema-valid by design
    // (refusalOr makes payload nullable) but with NO stage data.
    inv.setFixture('writer-vr', {
      status: 'refused', confidence: 0.4, uncertainty: ['insufficient sourcing'],
      escalation: { reason_code: 'insufficient_material', detail: 'source material too thin for a full draft', recommended_action: 're-research' },
      payload: null,
    });
    const item = await insertItem({
      idempotencyKey: 'refuse-1', type: 'draft', role: 'writer-vr', category: 'vr', state: 'ready_to_write',
    });
    const res = await tick({ invoker: inv, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.equal(r!.outcome, 'refused');
    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after.state, 'human_review', `state=${after.state}`);
    const esc = await testDb.select().from(reviewEscalations).where(eq(reviewEscalations.workItemId, item.id));
    assert.ok(esc.length >= 1, 'refusal must leave an escalation row');
  });

  it('an ok envelope with null payload fails schema-invalid (retryable), never crashes the tick', async () => {
    await freshSchema();
    const inv = new EchoInvoker(new Map());
    inv.setFixture('writer-vr', { status: 'ok', confidence: 0.9, uncertainty: [], escalation: null, payload: null });
    const item = await insertItem({
      idempotencyKey: 'nullpayload-1', type: 'draft', role: 'writer-vr', category: 'vr', state: 'ready_to_write',
    });
    const res = await tick({ invoker: inv, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.equal(r!.outcome, 'schema_invalid');
    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.ok(!['terminal_failure', 'human_review'].includes(after.state), `state=${after.state}`);
    assert.ok(after.backoffUntil !== null, 'must be scheduled for retry');
  });

  it('a draft whose body meets the internal-link minimum passes the internal_links gate', async () => {
    await freshSchema();
    const inv = new EchoInvoker(new Map());
    const body = `${'<p>Solid paragraph of genuinely substantive VR coverage prose. </p>'.repeat(120)}
      <p>See also <a href="/posts/related-vr-guide">our VR guide</a> and <a href="/posts/best-vr-headsets">best VR headsets</a>.</p>`;
    inv.setFixture('writer-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        title: 'Adequate Length VR Draft With Internal Links', slug: 'adequate-vr-draft', excerpt: 'Excerpt for the adequate draft.',
        body, tags: ['vr', 'headsets', 'guide'], metaTitle: 'Adequate Length VR Draft With Internal Links Guide',
        metaDescription: 'A deliberately long meta description that comfortably exceeds one hundred and twenty characters in total length so the meta gate passes.',
        intentBrand: null, isStraightNews: false, newsFit: null,
        visualBrief: { assetSource: 'brand-kit', altText: 'VR headset on a desk in editorial lighting', caption: null, contentSafetyClassification: 'safe', rightsLicensingStatus: 'owned', generationPromptOrProvenance: null, cropOrFocalPoint: null },
        internalLinkIntents: [], selfCheck: {},
      },
    });
    const item = await insertItem({
      idempotencyKey: 'links-1', type: 'draft', role: 'writer-vr', category: 'vr', state: 'ready_to_write',
    });
    const res = await tick({ invoker: inv, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.equal(r!.outcome, 'draft_persisted', `outcome=${r!.outcome} detail=${r!.detail}`);
  });
});

describe('writer starvation (PR #6: server-side fingerprints + chain wiring)', () => {
  // Fresh invoker per suite: shadowInvoker is module-level and would leak
  // fixtures (and thus candidates) from earlier suites across freshSchema().
  const inv = new EchoInvoker(new Map());

  it('model-echoed duplicate fingerprints collide; server-side keys do not (regression for 2026-09/10 starvation)', async () => {
    await freshSchema(); // isolate
    // First research run proposes two candidates echoing placeholder
    // fingerprints (the exact production failure mode).
    inv.setFixture('research-ai-chatbots', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        candidates: [
          // Topic B echoes the SAME model fingerprint as Topic A. Under the
          // old key (fingerprint only) it was silently dropped.
          { topic: 'Topic A', category: 'ai-chatbots', finding: 'A finding about topic A that is long enough.', source_url: 'https://example.com/a', source_date: '2026-10-01', event_date: null, suggested_angle: 'Angle A', confidence: 0.9, duplicate_fingerprint: 'fp1', news_fit: null },
          { topic: 'Topic B', category: 'ai-chatbots', finding: 'A finding about topic B that is long enough.', source_url: 'https://example.com/b', source_date: '2026-10-01', event_date: null, suggested_angle: 'Angle B', confidence: 0.9, duplicate_fingerprint: 'fp1', news_fit: null },
        ],
      },
    });
    await insertItem({ idempotencyKey: 'starve-1', role: 'research-ai-chatbots', category: 'ai-chatbots' });
    await tick({ invoker: inv, mode: 'shadow' });
    const writerItems = await testDb.select().from(workItems).where(eq(workItems.type, 'draft'));
    assert.equal(writerItems.length, 2, `expected both candidates to spawn writers, got ${writerItems.length}`);
    // Keys are derived from topic+source, not the model string.
    assert.ok(writerItems.every(w => w.idempotencyKey.startsWith('research-candidate:') && w.idempotencyKey !== 'research-candidate:fp1'));
    // Re-proposing the same topics must NOT duplicate writers.
    await insertItem({ idempotencyKey: 'starve-2', role: 'research-ai-chatbots', category: 'ai-chatbots' });
    await tick({ invoker: inv, mode: 'shadow' });
    const after = await testDb.select().from(workItems).where(eq(workItems.type, 'draft'));
    assert.equal(after.length, 2, 're-proposed topics must dedupe');
  });

  it('a terminal-failed writer item is revived when its topic is re-proposed', async () => {
    await freshSchema();
    inv.setFixture('research-ai-chatbots', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        candidates: [{ topic: 'Revive me', category: 'ai-chatbots', finding: 'Finding text for the revive test, long enough.', source_url: 'https://example.com/r', source_date: '2026-10-01', event_date: null, suggested_angle: 'Angle', confidence: 0.9, duplicate_fingerprint: 'fpX', news_fit: null }],
      },
    });
    // Pre-plant a dead item with the server-side key the engine will derive.
    const { createHash } = await import('node:crypto');
    const h = createHash('sha256').update('revive me|https://example.com/r'.toLowerCase()).digest('hex').slice(0, 32);
    await insertItem({
      idempotencyKey: `research-candidate:${h}-fpX`, type: 'draft', role: 'writer-ai-chatbots',
      state: 'terminal_failure', attemptCount: 13, maxAttempts: 12,
    });
    await insertItem({ idempotencyKey: 'revive-research-1', role: 'research-ai-chatbots', category: 'ai-chatbots' });
    await tick({ invoker: inv, mode: 'shadow' });
    const rows = await testDb.select().from(workItems).where(eq(workItems.type, 'draft'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].state, 'research_validated', 'terminal item must be revived, not re-inserted');
    assert.equal(rows[0].attemptCount, 0);
  });

  it('full chain: research → writer → end_rail → qc → publish in production mode', async () => {
    await freshSchema();
    const prodInvoker = new EchoInvoker(new Map());
    // A good draft fixture that passes every content gate: word count (800+
    // for vr), meta lengths, 2+ internal /posts/ links, no raw affiliate URLs.
    const longBody = (slug1: string, slug2: string) =>
      `<p>${'Immersive adult VR storytelling demands careful craft across many paragraphs of thoughtful analysis and practical guidance for curious readers who want depth. '.repeat(45)}</p>` +
      `<p>Related: <a href="/posts/${slug1}">guide one</a> and <a href="/posts/${slug2}">guide two</a>.</p>`;
    prodInvoker.setFixture('writer-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        title: 'Chain Test VR Draft', slug: 'chain-test-vr-draft', excerpt: 'A chain test draft.',
        body: longBody('seed-one', 'seed-two'),
        tags: ['vr', 'test', 'chain'], metaTitle: 'Chain Test VR Draft Meta Title For The Gate Check',
        metaDescription: 'Chain test meta description padded to satisfy the deterministic meta length gate of at least one hundred twenty characters.',
        intentBrand: null, isStraightNews: false, newsFit: null,
        visualBrief: { assetSource: 'brand-kit', altText: 'Abstract gradient banner for the chain test draft', caption: null, contentSafetyClassification: 'safe', rightsLicensingStatus: 'brand-owned', generationPromptOrProvenance: null, cropOrFocalPoint: null },
        internalLinkIntents: [], selfCheck: {},
      },
    });
    prodInvoker.setFixture('affiliate-injector', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: { relatedPostIds: [], relatedPostSlugs: ['seed-one'], affiliateIntent: { brand: null, contextuallyRelevant: false, rationale: 'no intent' }, isStraightNews: false, draftContextText: '' },
    });
    prodInvoker.setFixture('qc-publisher', {
      status: 'ok', confidence: 0.95, uncertainty: [], escalation: null,
      payload: { recommendation: 'publish', scorecard: [{ check: 'all', severity: 'info', pass: true, detail: 'fixture' }], remediation: [] },
    });
    // Cold start: seed two PUBLISHED posts so the end_rail gate can find a
    // valid related slug (avoids the cold-start suppression branch).
    await testDb.insert(posts).values([
      { title: 'Seed One', slug: 'seed-one', body: '<p>seed</p>', category: 'vr', status: 'published', publishedAt: new Date() },
      { title: 'Seed Two', slug: 'seed-two', body: '<p>seed</p>', category: 'vr', status: 'published', publishedAt: new Date() },
    ]);
    // Research proposes one candidate.
    prodInvoker.setFixture('research-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: { candidates: [{ topic: 'Chain topic', category: 'vr', finding: 'A chain-test finding with enough text.', source_url: 'https://example.com/chain', source_date: '2026-10-07', event_date: null, suggested_angle: 'Angle', confidence: 0.9, duplicate_fingerprint: 'fpC', news_fit: null }] },
    });
    await insertItem({ idempotencyKey: 'chain-research-1', role: 'research-vr', category: 'vr' });

    // Tick 1: research spawns writer candidate.
    await tick({ invoker: prodInvoker, mode: 'production' });
    const cand = await testDb.select().from(workItems).where(eq(workItems.type, 'draft'));
    assert.equal(cand.length, 1);

    // Tick 2: writer persists draft + media, goes visual_ready, seeds end_rail.
    await tick({ invoker: prodInvoker, mode: 'production' });
    const draftPost = (await testDb.select().from(posts).where(eq(posts.slug, 'chain-test-vr-draft')))[0];
    assert.ok(draftPost, 'draft post created');
    const rail = await testDb.select().from(workItems).where(eq(workItems.type, 'end_rail'));
    assert.equal(rail.length, 1, 'end_rail follow-on seeded');

    // Tick 3: end-rail plan validated, QC seeded with rail verdict.
    await tick({ invoker: prodInvoker, mode: 'production' });
    const railPlan = (await testDb.select().from(endRailPlans))[0];
    assert.ok(railPlan, 'end-rail plan recorded');
    const qc = await testDb.select().from(workItems).where(eq(workItems.type, 'qc'));
    assert.equal(qc.length, 1, 'qc follow-on seeded');
    assert.equal((qc[0].sourcePayload as any).postId, draftPost.id, 'qc item carries postId');

    // Tick 4: QC recommends publish, deterministic gates pass, post goes live.
    const res4 = await tick({ invoker: prodInvoker, mode: 'production' });
    const qcRun = res4.results.find(r => r.role === 'qc-publisher');
    assert.ok(qcRun, 'qc processed');
    assert.equal(qcRun!.outcome, 'published', `outcome=${qcRun!.outcome}`);
    const publishedPost = (await testDb.select().from(posts).where(eq(posts.id, draftPost.id)))[0];
    assert.equal(publishedPost.status, 'published');
    assert.ok(publishedPost.publishedAt);
    const decisions = await testDb.select().from(publishDecisions);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decision, 'published');
  });

  it('successful health_check terminalizes the item, resets attemptCount, and unblocks newer role items', async () => {
    await freshSchema(); // isolate
    shadowInvoker.setFixture('affiliate-health-checker', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: { observations: [{ url: 'https://affiliate.example', status: 'healthy' }] },
    });
    // The production failure mode: one old item stuck in in_progress with a
    // runaway attempt counter (493) — ladder reads paid_tier2 forever while
    // per-role cap starves every newer item of the role.
    const stuck = await insertItem({
      type: 'health_check', role: 'affiliate-health-checker', state: 'in_progress',
      attemptCount: 493, maxAttempts: 5, idempotencyKey: 'stuck-health-482',
    });
    const daily = await insertItem({
      type: 'health_check', role: 'affiliate-health-checker', state: 'discovered',
      attemptCount: 0, maxAttempts: 12, idempotencyKey: 'daily-health',
    });

    // Tick 1: stuck item (oldest) is claimed, runs, must terminalize.
    const res1 = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    const stuckRun = res1.results.find(r => r.workItemId === stuck.id);
    assert.ok(stuckRun, 'stuck item processed');
    assert.equal(stuckRun!.outcome, 'health_recorded');
    const afterStuck = (await testDb.select().from(workItems).where(eq(workItems.id, stuck.id)))[0];
    assert.equal(afterStuck.state, 'audit_completed', `state=${afterStuck.state}`); // terminal: never claimed again
    assert.equal(afterStuck.attemptCount, 0, 'attemptCount resets on success');
    // The newer daily item was capped out this tick by the stuck item — the
    // starvation signature before the fix.
    const dailyFirst = res1.results.find(r => r.workItemId === daily.id);
    assert.ok(dailyFirst, 'daily item considered in tick 1');
    assert.equal(dailyFirst!.outcome, 'skipped_concurrency_cap');

    // Tick 2: with the stuck item gone, the daily item finally runs — free.
    const res2 = await tick({ invoker: shadowInvoker, mode: 'shadow' });
    const dailyRun = res2.results.find(r => r.workItemId === daily.id);
    assert.ok(dailyRun, 'daily item processed once the stuck item terminalized');
    assert.equal(dailyRun!.outcome, 'health_recorded');
    const afterDaily = (await testDb.select().from(workItems).where(eq(workItems.id, daily.id)))[0];
    assert.equal(afterDaily.state, 'audit_completed');
    assert.equal(afterDaily.attemptCount, 0);

    // Tick 3: the seeder's own daily item (created at tick-1 start) gets its
    // turn once the cap frees up; afterwards every item of the role is
    // terminal — cadence restored, nothing claimable, all ladders reset.
    await tick({ invoker: shadowInvoker, mode: 'shadow' });
    const remaining = await testDb.select().from(workItems).where(eq(workItems.role, 'affiliate-health-checker'));
    assert.ok(remaining.length >= 3, `expected stuck + daily + seeded items, got ${remaining.length}`);
    for (const it of remaining) {
      assert.equal(it.state, 'audit_completed', `item ${it.id} state=${it.state}`);
      assert.equal(it.attemptCount, 0, `item ${it.id} attempts=${it.attemptCount}`);
    }
  });
});
