import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshSchema, testPool, closePool } from './setup';
import {
  tierForAttempt, ladderEnabled, estimateCostUsd, actualCostUsd,
  dailyBudgetUsd, utcDay, sumPaidSpendSql,
} from '../server/orchestrator/model-ladder';
import { LadderInvoker, EchoInvoker, type AgentInvoker, type InvokeMeta, type InvokeResult } from '../server/orchestrator/invoker';
import type { LedgerDb } from '../server/orchestrator/budget-ledger';

const ledgerDb = testPool as unknown as LedgerDb;

// Env snapshot so dormant-by-default invariants survive the suite.
const ENV_KEYS = ['PAID_LLM_URL', 'PAID_LLM_API_KEY', 'PAID_LLM_DAILY_BUDGET_USD', 'PAID_LLM_RESERVE_MARGIN', 'PAID_LLM_RESERVATION_TTL_HOURS', 'PAID_LLM_TIMEOUT_MS', 'PAID_LLM_MAX_TOKENS_TIER1', 'PAID_LLM_MAX_TOKENS_TIER2', 'ESCALATE_AFTER_ATTEMPT'] as const;
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

  it('estimate is CONSERVATIVE: reservation input assumption + tier max_tokens', () => {
    // tier1: (8000 input + 3000 max_tokens) * $0.5/M = $0.0055
    assert.ok(Math.abs(estimateCostUsd('paid_tier1') - 0.0055) < 1e-9);
    // tier2: (8000 + 3000) * $1.5/M = $0.0165
    assert.ok(Math.abs(estimateCostUsd('paid_tier2') - 0.0165) < 1e-9);
  });

  it('actual cost comes from usage tokens', () => {
    // (1200 in + 800 out) * $0.5/M = $0.001
    assert.ok(Math.abs(actualCostUsd('paid_tier1', 1200, 800) - 0.001) < 1e-9);
  });
});

describe('daily budget + conservative reservation', () => {
  it('defaults to $2.00/day and rejects non-positive overrides', () => {
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.PAID_LLM_DAILY_BUDGET_USD = '10';
    assert.equal(dailyBudgetUsd(), 10);
    process.env.PAID_LLM_DAILY_BUDGET_USD = '-1';
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.PAID_LLM_DAILY_BUDGET_USD = 'abc';
    assert.equal(dailyBudgetUsd(), 2.0);
  });

  it('UTC day key format is stable', () => {
    assert.match(utcDay(), /^\d{4}-\d{2}-\d{2}$/);
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

before(async () => {
  await freshSchema();
  await testPool.query('TRUNCATE paid_budget_reservations, paid_budget_days');
});
after(async () => { await closePool(); });

describe('LadderInvoker routing (ledger-backed)', () => {
  it('dormant: paid tier request is served at free tier, cost 0, no reservation', async () => {
    // no PAID_LLM_* env → disabled
    const free = makeFreeEcho();
    const inv = new LadderInvoker(free, new StubPaidInvoker(), ledgerDb);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.budgetFallback, undefined);
    assert.equal(res.accountingFallback, undefined);
    assert.equal(res.reservation, undefined);
  });

  it('enabled: paid call reserves, routes paid, settles on success', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, ledgerDb);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier2', attempt: 6 });
    assert.equal(paid.calls, 1);
    assert.equal(res.tier, 'paid_tier2');
    assert.equal(res.costUsd, 0.0042);
    assert.ok(res.reservation, 'reservation should be recorded');
    assert.equal(res.reservation!.state, 'settled');
  });

  it('cap reached: routes to free and flags budgetFallback, paid invoker untouched', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, ledgerDb);
    // exhaust the day's budget first
    await testPool.query(
      `INSERT INTO paid_budget_days (day, budget_usd, settled_usd) VALUES ($1::date, 0.001, 0.001)
       ON CONFLICT (day) DO UPDATE SET budget_usd = 0.001, settled_usd = 0.001, reserved_usd = 0`,
      [utcDay()],
    );
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(paid.calls, 0);
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.budgetFallback, true);
  });

  it('accounting unavailable: FAIL CLOSED — free runs, accountingFallback set, paid untouched', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const broken: LedgerDb = { query: async () => { throw new Error('db down'); } };
    const inv = new LadderInvoker(makeFreeEcho(), paid, broken);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(paid.calls, 0);
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.accountingFallback, true);
    assert.equal(res.budgetFallback, undefined);
  });

  it('free tier requests never touch the paid invoker even when enabled', async () => {
    process.env.PAID_LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, ledgerDb);
    await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'free' });
    await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow' });
    assert.equal(paid.calls, 0);
  });
});

// ── Spend accounting (audit aggregate) against real Postgres ─────────────────

describe('paid spend accounting (db)', () => {
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
