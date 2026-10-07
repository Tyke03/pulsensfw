/**
 * refusal-hold.test.ts — an agent that declares status='refused'|'escalate'
 * in a SCHEMA-VALID envelope must be held for human review, never recorded as
 * a success and never silently dropped.
 *
 * Contract: shared/schema.ts (agent_runs.status: succeeded|schema_invalid|
 * failed|refused|escalated), packages.ts (status is a structured field), and
 * engine.classifyError (refused/escalated → human_review). The regression this
 * pins: runAgent parsed a refusal as valid output and returned status
 * 'succeeded', so the stage ran on a null payload and the item completed
 * (research_completed) with zero candidates — the task was swallowed.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshSchema, testDb, closePool } from './setup';
import { workItems, agentRuns, reviewEscalations } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { tick } from '../server/orchestrator/engine';
import { EchoInvoker } from '../server/orchestrator/invoker';

const invoker = new EchoInvoker(new Map());

before(async () => { await freshSchema(); });
after(async () => { await closePool(); });

async function insertResearch(key: string) {
  const [item] = await testDb.insert(workItems).values({
    idempotencyKey: key, type: 'research', role: 'research-vr', category: 'vr', state: 'discovered',
  }).returning();
  return item;
}

describe('agent-declared refusal/escalation is held for review, never swallowed', () => {
  it('status=refused (valid envelope) → run refused, item human_review, escalation recorded, strikes preserved', async () => {
    await freshSchema();
    invoker.setFixture('research-vr', {
      status: 'refused', confidence: 0.2,
      uncertainty: ['thin sourcing'],
      escalation: { reason_code: 'no_reader_relevance', detail: 'dry corporate filing', recommended_action: 'archive the lead' },
      payload: null,
    });
    const item = await insertResearch('refusal-hold-1');

    const res = await tick({ invoker, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.ok(r, 'item processed');
    assert.equal(r!.outcome, 'refused');

    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after.state, 'human_review', `state=${after.state}`); // held, not silently completed
    assert.notEqual(after.state, 'research_completed');

    const runs = await testDb.select().from(agentRuns).where(eq(agentRuns.workItemId, item.id));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'refused'); // NOT 'succeeded'

    const esc = await testDb.select().from(reviewEscalations).where(eq(reviewEscalations.workItemId, item.id));
    assert.ok(esc.length >= 1, 'a review escalation must be recorded');
    assert.equal(esc[0].reasonCode, 'human_review_required');

    // A refusal is a failure-class outcome: the attempt counter must NOT reset,
    // so the retry/ladder accounting stays honest.
    assert.ok(after.attemptCount >= 1, `attemptCount=${after.attemptCount}`);
  });

  it('status=escalate → run escalated, item human_review', async () => {
    await freshSchema();
    invoker.setFixture('research-vr', {
      status: 'escalate', confidence: 0.4,
      uncertainty: ['needs a human call'],
      escalation: { reason_code: 'policy_ambiguity', detail: 'edge case', recommended_action: 'review' },
      payload: null,
    });
    const item = await insertResearch('refusal-hold-2');

    const res = await tick({ invoker, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.equal(r!.outcome, 'escalated');

    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after.state, 'human_review');
    const runs = await testDb.select().from(agentRuns).where(eq(agentRuns.workItemId, item.id));
    assert.equal(runs[0].status, 'escalated');
  });

  it('status=ok still succeeds and is NOT diverted (guard against over-eager routing)', async () => {
    await freshSchema();
    invoker.setFixture('research-vr', {
      status: 'ok', confidence: 0.9, uncertainty: [], escalation: null,
      payload: {
        candidates: [{
          topic: 'A VR headset ships eye tracking', category: 'vr',
          finding: 'Vendor shipped eye tracking for adult VR.', source_url: 'https://example.com/x',
          source_date: '2026-09-22', event_date: null, suggested_angle: 'What it means',
          confidence: 0.8, duplicate_fingerprint: 'vr-refusal-guard-1', news_fit: null,
        }],
      },
    });
    const item = await insertResearch('refusal-hold-3');
    const res = await tick({ invoker, mode: 'shadow' });
    const r = res.results.find(x => x.workItemId === item.id);
    assert.equal(r!.outcome, 'research_proposed');
    const after = (await testDb.select().from(workItems).where(eq(workItems.id, item.id)))[0];
    assert.equal(after.state, 'research_completed');
  });
});
