import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshSchema, testPool, closePool } from './setup';
import {
  tierForAttempt, ladderEnabled, estimateCostUsd, actualCostUsd,
  budgetExhausted, budgetRemainingUsd, dailyBudgetUsd, utcDay, sumPaidSpendSql,
  type SpendSummary,
} from '../server/orchestrator/model-ladder';
import { LadderInvoker, EchoInvoker, type AgentInvoker, type InvokeMeta, type InvokeResult } from '../server/orchestrator/invoker';

// Env snapshot so dormant-by-default invariants survive the suite.
const ENV_KEYS = ['PAID_LLM_URL', 'PAID_LLM_API_KEY', 'PAID_LLM_DAILY_BUDGET_USD', 'ESCALATE_AFTER_ATTEMPT'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('model ladder policy', () => {
  it('is dormant by default: no env vars → everything stays free', () => {
    assert.equal(ladderEnabled(), false);
    for (const attempt of [1, 2, 3, 5, 9, 20]) {
      assert.equal(tierForAttempt(attempt, 'writer-vr'), 'free');
    }
  });

  it('free-first, then tier1 at ESCALATE_AFTER_ATTEMPT, then tier2 after 3 more failures', () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    assert.equal(ladderEnabled(), true);
    // default ESCALATE_AFTER_ATTEMPT = 3
    assert.equal(tierForAttempt(1, 'writer-vr'), 'free');
    assert.equal(tierForAttempt(2, 'writer-vr'), 'free');
    assert.equal(tierForAttempt(3, 'writer-vr'), 'paid_tier1');
    assert.equal(tierForAttempt(5, 'writer-vr'), 'paid_tier1');
    assert.equal(tierForAttempt(6, 'writer-vr'), 'paid_tier2');
    assert.equal(tierForAttempt(12, 'writer-vr'), 'paid_tier2');
  });

  it('honors ESCALATE_AFTER_ATTEMPT override', () => {
    process.env.PAID_LLM_URL = 'x';
    process.env.PAID_LLM_API_KEY = 'y';
    process.env.ESCALATE_AFTER_ATTEMPT = '5';
    assert.equal(tierForAttempt(4, 'writer-vr'), 'free');
    assert.equal(tierForAttempt(5, 'writer-vr'), 'paid_tier1');
    assert.equal(tierForAttempt(8, 'writer-vr'), 'paid_tier2');
  });
});

describe('ladder cost math', () => {
  it('free tier costs nothing', () => {
    assert.equal(estimateCostUsd('free'), 0);
    assert.equal(actualCostUsd('free', 100_000, 50_000), 0);
  });

  it('estimate uses blended $/1M rate over input+output tokens', () => {
    // tier1: (3500 est-input + 2000 est-output) * $0.5/M = $0.00275
    assert.ok(Math.abs(estimateCostUsd('paid_tier1') - 0.00275) < 1e-9);
    // tier2: (3500 + 3000) * $1.5/M = $0.00975
    assert.ok(Math.abs(estimateCostUsd('paid_tier2') - 0.00975) < 1e-9);
  });

  it('actual cost comes from usage tokens', () => {
    // (1200 in + 800 out) * $0.5/M = $0.001
    assert.ok(Math.abs(actualCostUsd('paid_tier1', 1200, 800) - 0.001) < 1e-9);
  });
});

describe('daily budget guard', () => {
  it('defaults to $2.00/day and rejects non-positive overrides', () => {
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.PAID_LLM_DAILY_BUDGET_USD = '10';
    assert.equal(dailyBudgetUsd(), 10);
    process.env.PAID_LLM_DAILY_BUDGET_USD = '-1';
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.PAID_LLM_DAILY_BUDGET_USD = 'abc';
    assert.equal(dailyBudgetUsd(), 2.0);
  });

  it('spend from a previous UTC day does not count against today', () => {
    const stale: SpendSummary = { day: '2020-01-01', paidCostUsd: 99 };
    assert.equal(budgetRemainingUsd(stale), dailyBudgetUsd());
    assert.equal(budgetExhausted(stale, 0.00275), false);
    assert.match(utcDay(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('exhausts when remaining budget cannot cover the next estimate', () => {
    // $1.999 spent of $2 → $0.001 left, which CANNOT cover a $0.00275 call
    const today: SpendSummary = { day: utcDay(), paidCostUsd: 1.999 };
    assert.equal(budgetExhausted(today, 0.00275), true);
    // but a smaller call still fits
    assert.equal(budgetExhausted(today, 0.0005), false);
    // $1.9999 spent → $0.0001 left → any normal call exhausts
    const almost: SpendSummary = { day: utcDay(), paidCostUsd: 1.9999 };
    assert.equal(budgetExhausted(almost, 0.00275), true);
    const atCap: SpendSummary = { day: utcDay(), paidCostUsd: 2.0 };
    assert.equal(budgetExhausted(atCap, 0.0001), true);
  });
});

// ── LadderInvoker routing ─────────────────────────────────────────────────────

class StubPaidInvoker implements AgentInvoker {
  calls = 0;
  async invoke(_packet: unknown, _sys: string, meta: InvokeMeta): Promise<InvokeResult> {
    this.calls += 1;
    return { ok: true, output: { status: 'ok' }, provider: 'stub-paid', model: meta.tier ?? 'unknown', durationMs: 1, tier: meta.tier, costUsd: 0.0042 };
  }
}

function makeFreeEcho(): EchoInvoker {
  const inv = new EchoInvoker(new Map());
  inv.setFixture('writer-vr', { status: 'ok', confidence: 0.9, uncertainty: [], escalation: null, payload: {} });
  return inv;
}

describe('LadderInvoker routing', () => {
  it('dormant: paid tier request is served at free tier, cost 0, no budget event', async () => {
    // no PAID_LLM_* env → disabled
    const free = makeFreeEcho();
    const inv = new LadderInvoker(free, new StubPaidInvoker(), async () => null);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.budgetFallback, undefined);
    assert.equal((res.output as any).payload !== undefined || (res.output as any).status, true);
  });

  it('enabled: paid call routes to the paid invoker with tier preserved and recorded cost', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, async () => ({ day: utcDay(), paidCostUsd: 0 }));
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier2', attempt: 6 });
    assert.equal(paid.calls, 1);
    assert.equal(res.tier, 'paid_tier2');
    assert.equal(res.costUsd, 0.0042);
  });

  it('budget cap hit: paid request falls back to free and flags budgetFallback', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const spend: SpendSummary = { day: utcDay(), paidCostUsd: 2.0 }; // at the $2 cap
    const inv = new LadderInvoker(makeFreeEcho(), paid, async () => spend);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(paid.calls, 0);
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.budgetFallback, true);
  });

  it('free tier requests never touch the paid invoker even when enabled', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, async () => null);
    await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'free' });
    await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow' });
    assert.equal(paid.calls, 0);
  });
});

// ── Spend accounting against real Postgres ───────────────────────────────────

describe('paid spend accounting (db)', () => {
  before(async () => { await freshSchema(); });
  after(async () => { await closePool(); });

  it('sums today\'s paid-tier cost only, ignoring free runs and yesterday', async () => {
    await testPool.query(
      `INSERT INTO work_items (idempotency_key, type, role, category, state)
       VALUES ('ladder-spend-1', 'research', 'research-vr', 'vr', 'discovered')`,
    );
    const { rows: wi } = await testPool.query(`SELECT id FROM work_items WHERE idempotency_key = 'ladder-spend-1'`);
    const workItemId = wi[0].id;
    // today: one paid run ($0.25), one paid run ($0.50), one free run ($0.123 must be ignored)
    await testPool.query(
      `INSERT INTO agent_runs (work_item_id, role, prompt_id, prompt_version, mode, input_hash, status, attempt, tier, cost_usd)
       VALUES ($1, 'writer-vr', 'p', '1', 'production', 'h', 'succeeded', 3, 'paid_tier1', 0.25),
              ($1, 'writer-vr', 'p', '1', 'production', 'h', 'failed', 4, 'paid_tier2', 0.50),
              ($1, 'writer-vr', 'p', '1', 'production', 'h', 'succeeded', 1, 'free', 0.123)`,
      [workItemId],
    );
    // yesterday: paid spend that must not count
    await testPool.query(
      `INSERT INTO agent_runs (work_item_id, role, prompt_id, prompt_version, mode, input_hash, status, attempt, tier, cost_usd, created_at)
       VALUES ($1, 'writer-vr', 'p', '1', 'production', 'h', 'succeeded', 5, 'paid_tier1', 9.99, now() - interval '1 day')`,
      [workItemId],
    );
    const { rows } = await testPool.query(sumPaidSpendSql());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].day, utcDay());
    assert.ok(Math.abs(Number(rows[0].paidCostUsd) - 0.75) < 1e-9, `expected 0.75, got ${rows[0].paidCostUsd}`);
  });
});
