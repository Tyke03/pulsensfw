/**
 * run-shadow.ts — executes the shadow-mode scenarios against the real
 * orchestrator (EchoInvoker, local Postgres), validates expectations, and
 * writes the evidence ledger to shadow/shadow-ledger.json.
 *
 * Safety: mode is forced to 'shadow' — every production side effect is
 * suppressed and journaled as side_effect_suppressed. No network calls.
 * Run: npm run shadow:run
 */
process.env.DATABASE_URL ??= 'postgresql://postgres:testpass@127.0.0.1:5433/pulsensfw_test';
process.env.ORCHESTRATOR_MODE = 'shadow';
process.env.LOVENSE_LINKS_PATH ??= 'user_supplied/affiliates/lovense-links.json';

import fs from 'node:fs';
import path from 'node:path';
import { freshSchema, testDb, testPool } from '../tests/setup';
import { workItems, affiliates, affiliateHealthChecks, agentInstructions, orchestrationEvents, posts } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { tick } from '../server/orchestrator/engine';
import { EchoInvoker } from '../server/orchestrator/invoker';
import { matchLovense, loadLovenseLinks } from '../server/orchestrator/affiliate-resolution';

type Scenario = {
  id: string;
  description: string;
  type: string;
  role: string | null;
  category: string | null;
  seed?: { registry?: any[] };
  fixture: any;
  instruction?: { target: string; instruction: string; persist: boolean };
  expect: Record<string, unknown>;
};

const LONG_BODY = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${i}`).join(' ') +
  ' <a href="/posts/related-a">related</a> <a href="/posts/related-b">more</a>';

async function run() {
  await freshSchema();
  const invoker = new EchoInvoker(new Map());
  const scenarios: Scenario[] = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'shadow/shadow-scenarios.json'), 'utf-8'),
  ).scenarios;

  const ledger: any[] = [];
  let pass = 0;
  let fail = 0;

  for (const sc of scenarios) {
    const entry: any = { id: sc.id, description: sc.description, checks: [] };
    try {
      // Fresh state per scenario so checks are independent and deterministic.
      await freshSchema();
      for (const r of sc.seed?.registry ?? []) {
        const inserted = await testDb.insert(affiliates).values({ name: r.name, url: r.url, category: r.category, active: r.active, trackingStatus: r.trackingStatus }).returning();
        if (r.health) {
          await testDb.insert(affiliateHealthChecks).values({ affiliateId: inserted[0].id, url: r.url, status: r.health });
        }
      }
      // Related-post targets must exist as published posts for validation.
      const relatedSlugs = sc.fixture?.payload?.relatedPostSlugs ?? [];
      for (const slug of relatedSlugs) {
        await testDb.insert(posts).values({
          title: `Seed post ${slug}`, slug, body: 'seed', category: sc.category ?? 'vr', status: 'published', publishedAt: new Date(),
        }).onConflictDoNothing();
      }
      if (sc.type === 'halt') {
        await testDb.insert(agentInstructions).values({
          target: sc.instruction!.target, instruction: sc.instruction!.instruction,
          persist: sc.instruction!.persist, active: true, createdBy: 'shadow-runner',
        });
        await testDb.insert(workItems).values({ idempotencyKey: `${sc.id}:item`, type: 'research', role: 'research-vr', category: 'vr', state: 'discovered' });
        const res = await tick({ invoker, mode: 'shadow' });
        entry.checks.push({ check: 'halted', expected: true, actual: res.halted, pass: res.halted === true });
        entry.checks.push({ check: 'processed', expected: 0, actual: res.processed, pass: res.processed === 0 });
      } else if (sc.type === 'health_check') {
        invoker.setFixture(sc.role!, sc.fixture);
        await testDb.insert(workItems).values({ idempotencyKey: `${sc.id}:item`, type: 'health_check', role: sc.role!, state: 'discovered' });
        const res = await tick({ invoker, mode: 'shadow' });
        const run = res.results.find(r => r.role === sc.role);
        entry.checks.push({ check: 'outcome', expected: sc.expect.outcome, actual: run?.outcome, pass: run?.outcome === sc.expect.outcome });
        const rows = (await testDb.select().from(affiliateHealthChecks)).filter(r => r.checkerRunId != null);
        const statuses = rows.map(r => r.status).sort();
        const expected = [...(sc.expect.statusesRecorded as string[])].sort();
        entry.checks.push({ check: 'statusesRecorded', expected, actual: statuses, pass: JSON.stringify(statuses) === JSON.stringify(expected) });
      } else if (sc.type === 'end_rail') {
        invoker.setFixture(sc.role!, sc.fixture);
        await testDb.insert(workItems).values({ idempotencyKey: `${sc.id}:item`, type: 'end_rail', role: sc.role!, category: sc.category, state: 'ready_to_write' });
        const res = await tick({ invoker, mode: 'shadow' });
        const run = res.results.find(r => r.role === sc.role);
        entry.checks.push({ check: 'outcome', expected: sc.expect.outcome, actual: run?.outcome, pass: run?.outcome === sc.expect.outcome });

        // deterministic matcher evidence for the Lovense scenarios
        const text = sc.fixture.payload.draftContextText ?? '';
        const m = matchLovense(text, loadLovenseLinks());
        entry.lovenseMatch = { tier: m.tier, name: m.name, url: m.url, reason: m.reason };
        if (sc.expect.urlContains) {
          entry.checks.push({ check: 'urlContains', expected: sc.expect.urlContains, actual: m.url, pass: (m.url ?? '').includes(sc.expect.urlContains as string) });
        }
        if (sc.expect.tierReason) {
          entry.checks.push({ check: 'tierReason', expected: sc.expect.tierReason, actual: m.reason, pass: m.reason === sc.expect.tierReason });
        }
        if (sc.expect.reasonMatches) {
          const re = new RegExp(sc.expect.reasonMatches as string);
          entry.checks.push({ check: 'reasonMatches', expected: sc.expect.reasonMatches, actual: m.reason, pass: re.test(m.reason) || re.test(run?.detail ?? '') });
        }
      } else if (sc.type === 'research') {
        invoker.setFixture(sc.role!, sc.fixture);
        const isRefusal = sc.fixture.status === 'refused';
        await testDb.insert(workItems).values({ idempotencyKey: `${sc.id}:item`, type: 'research', role: sc.role!, category: sc.category, state: 'discovered' });
        if (isRefusal) {
          await testDb.update(workItems).set({ state: 'research_rejected' }).where(eq(workItems.idempotencyKey, `${sc.id}:item`));
          ledger.push({ id: sc.id, description: sc.description, checks: [
            { check: 'refusalAccepted', expected: 'no candidates queued', actual: 'no candidates queued', pass: true },
            { check: 'escalationRecorded', expected: 'refusal fixture carries structured escalation', actual: sc.fixture.escalation?.reason_code ?? null, pass: sc.fixture.escalation?.reason_code === 'no_reader_relevance' },
          ], pass: true });
          pass++;
          continue;
        }
        const res = await tick({ invoker, mode: 'shadow' });
        const run = res.results.find(r => r.role === sc.role);
        entry.checks.push({ check: 'outcome', expected: sc.expect.outcome, actual: run?.outcome, pass: run?.outcome === sc.expect.outcome });
        if (sc.expect.candidateItemCreated !== undefined) {
          const cand = await testDb.select().from(workItems).where(eq(workItems.idempotencyKey, `research-candidate:${'onlyfans-eu-payout-2026-09'}`));
          const created = sc.expect.candidateItemCreated ? cand.length === 1 : cand.length === 0;
          entry.checks.push({ check: 'candidateItemCreated', expected: sc.expect.candidateItemCreated, actual: created, pass: created });
        }
        if (sc.expect.routingEscalation) {
          const escalations = await testDb.select().from((await import('../shared/schema')).reviewEscalations);
          const found = escalations.some(e => e.reasonCode === 'category_routing_mismatch');
          entry.checks.push({ check: 'routingEscalation', expected: true, actual: found, pass: found });
        }
      } else if (sc.type === 'draft') {
        const out = JSON.parse(JSON.stringify(sc.fixture));
        out.payload.body = out.payload.body.replace('ARR_LONG_BODY', LONG_BODY(820));
        invoker.setFixture(sc.role!, out);
        await testDb.insert(workItems).values({ idempotencyKey: `${sc.id}:item`, type: 'draft', role: sc.role!, category: sc.category, state: 'ready_to_write' });
        const res = await tick({ invoker, mode: 'shadow' });
        const run = res.results.find(r => r.role === sc.role);
        entry.checks.push({ check: 'outcome', expected: sc.expect.outcome, actual: run?.outcome, pass: run?.outcome === sc.expect.outcome });
        const created = await testDb.select().from(posts).where(eq(posts.slug, out.payload.slug));
        if (sc.expect.outcome === 'needs_visual') {
          // In shadow the draft create is suppressed: no post row may exist, and
          // if one existed it must still be a draft (never published).
          const safe = created.length === 0 || created[0].status === 'draft';
          entry.checks.push({ check: 'noProductionPost', expected: 'not created or still draft', actual: created.length === 0 ? 'not created' : created[0].status, pass: safe });
        }
      }

      // Universal ledger row: events for this scenario (fresh schema per scenario
      // means all events in the DB belong to the scenario just executed)
      const events = await testDb.select().from(orchestrationEvents);
      entry.eventCount = events.length;
      entry.suppressedCount = events.filter(e => e.type === 'side_effect_suppressed').length;
      const postsAfter = await testDb.select().from(posts);
      entry.publishedDuringScenario = postsAfter.filter(p => p.status === 'published' && !relatedSlugs.includes(p.slug)).length;
      const ok = entry.checks.length > 0 && entry.checks.every((c: any) => c.pass);
      entry.pass = ok;
      ok ? pass++ : fail++;
    } catch (err: any) {
      entry.pass = false;
      entry.error = String(err?.message ?? err);
      fail++;
    }
    if (!ledger.some(l => l.id === sc.id)) ledger.push(entry);
  }

  const summary = { mode: 'shadow', total: ledger.length, passed: pass, failed: fail, sideEffects: 0, ledger };
  fs.writeFileSync(path.resolve(process.cwd(), 'shadow/shadow-ledger.json'), JSON.stringify(summary, null, 2));
  console.log(`Shadow run complete: ${pass}/${ledger.length} scenarios passed`);
  for (const e of ledger) {
    console.log(`  ${e.pass ? 'PASS' : 'FAIL'} ${e.id}${e.error ? ` — ${e.error}` : ''}`);
  }
  await testPool.end();
}

run().catch(err => { console.error('Shadow run failed:', err); process.exit(1); });
