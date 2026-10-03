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
const ENV_KEYS = ['POLLINATIONS_API_KEY', 'POLLINATIONS_DAILY_BUDGET_USD', 'POLLINATIONS_RESERVE_MARGIN', 'POLLINATIONS_RESERVATION_TTL_HOURS', 'POLLINATIONS_TIMEOUT_MS', 'POLLINATIONS_MAX_TOKENS_TIER1', 'POLLINATIONS_MAX_TOKENS_TIER2', 'POLLINATIONS_ESCALATE_AFTER_ATTEMPT'] as const;
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

  it('free-first, then tier1 at POLLINATIONS_ESCALATE_AFTER_ATTEMPT, then tier2 after 3 more failures', () => {
    process.env.POLLINATIONS_API_KEY = 'sk-test';
    assert.equal(ladderEnabled(), true);
    // default POLLINATIONS_ESCALATE_AFTER_ATTEMPT = 3
    assert.equal(tierForAttempt(1, 'writer-vr'), 'free');
    assert.equal(tierForAttempt(2, 'writer-vr'), 'free');
    assert.equal(tierForAttempt(3, 'writer-vr'), 'paid_tier1');
    assert.equal(tierForAttempt(5, 'writer-vr'), 'paid_tier1');
    assert.equal(tierForAttempt(6, 'writer-vr'), 'paid_tier2');
    assert.equal(tierForAttempt(12, 'writer-vr'), 'paid_tier2');
  });

  it('honors POLLINATIONS_ESCALATE_AFTER_ATTEMPT override', () => {
    process.env.POLLINATIONS_API_KEY = 'sk-test';
    process.env.POLLINATIONS_ESCALATE_AFTER_ATTEMPT = '5';
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
    // tier1: (8000 input × 0.0000001 + 3000 max_tokens × 0.0000005) Pollen × $1/Pollen = $0.0023
    assert.ok(Math.abs(estimateCostUsd('paid_tier1') - 0.0023) < 1e-9);
    // tier2: (8000 × 0.000002 + 3000 × 0.00001) Pollen × $1/Pollen = $0.046
    assert.ok(Math.abs(estimateCostUsd('paid_tier2') - 0.046) < 1e-9);
  });

  it('actual cost comes from usage tokens', () => {
    // (1200 in × 0.0000001 + 800 out × 0.0000005) Pollen × $1/Pollen = $0.00052
    assert.ok(Math.abs(actualCostUsd('paid_tier1', 1200, 800) - 0.00052) < 1e-9);
  });
});

describe('daily budget + conservative reservation', () => {
  it('defaults to $2.00/day and rejects non-positive overrides', () => {
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.POLLINATIONS_DAILY_BUDGET_USD = '10';
    assert.equal(dailyBudgetUsd(), 10);
    process.env.POLLINATIONS_DAILY_BUDGET_USD = '-1';
    assert.equal(dailyBudgetUsd(), 2.0);
    process.env.POLLINATIONS_DAILY_BUDGET_USD = 'abc';
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
    // no POLLINATIONS_API_KEY → disabled
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
    process.env.POLLINATIONS_API_KEY = 'sk-test';
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
    process.env.POLLINATIONS_API_KEY = 'sk-test';
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
    process.env.POLLINATIONS_API_KEY = 'sk-test';
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

  it('sweep failure: FAIL CLOSED — free runs with accountingFallback and zero paid calls', async () => {
    process.env.POLLINATIONS_API_KEY = 'sk-test';
    await testPool.query('TRUNCATE paid_budget_reservations, paid_budget_days');
    const paid = new StubPaidInvoker();
    // Ledger whose ONLY failure is the sweep statement (reservation sweep) —
    // the sweep must gate authorization entirely.
    const sweepBroken: LedgerDb = {
      query: (text: string, values?: unknown[]) => testPool.query(text, values),
      connect: async () => {
        const real = await testPool.connect();
        return {
          query: async (text: string, values?: unknown[]) => {
            if (text.includes("reserved_at < NOW()")) throw new Error('sweep outage');
            return real.query(text, values);
          },
          release: () => real.release(),
        };
      },
    } as unknown as LedgerDb;
    const inv = new LadderInvoker(makeFreeEcho(), paid, sweepBroken);
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(paid.calls, 0); // paid invoker never invoked
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.accountingFallback, true);
    assert.equal(res.budgetFallback, undefined);
    assert.equal(res.reservation, undefined);
    const { rows } = await testPool.query(`SELECT count(*)::int AS n FROM paid_budget_reservations`);
    assert.equal(rows[0].n, 0); // no reservation was created
  });

  it('free tier requests never touch the paid invoker even when enabled', async () => {
    process.env.POLLINATIONS_API_KEY = 'sk-test';
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
