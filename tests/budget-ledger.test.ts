import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { freshSchema, testPool, closePool } from './setup';
import { PaidOpenAIInvoker, LadderInvoker, EchoInvoker } from '../server/orchestrator/invoker';
import { estimateCostUsd } from '../server/orchestrator/model-ladder';
import {
  reserveForCall, settleReservation, releaseReservation, markReconciliationNeeded,
  sweepStaleReservations, resolveReconciliation, summarizeDay, accountingStatus,
  ledgerHealthy, computeReservationAmountUsd, round6, reservationTtlHours,
  type LedgerDb,
} from '../server/orchestrator/budget-ledger';
import { utcDay, dailyBudgetUsd, LADDER, estimateCostUsd } from '../server/orchestrator/model-ladder';

const db = testPool as unknown as LedgerDb;

const ENV_KEYS = ['PAID_LLM_URL', 'PAID_LLM_API_KEY', 'PAID_LLM_DAILY_BUDGET_USD', 'PAID_LLM_RESERVE_MARGIN', 'PAID_LLM_RESERVATION_TTL_HOURS', 'PAID_LLM_TIMEOUT_MS', 'PAID_LLM_MAX_TOKENS_TIER1', 'PAID_LLM_MAX_TOKENS_TIER2', 'ESCALATE_AFTER_ATTEMPT'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
 for (const k of ENV_KEYS) delete process.env[k];
  // isolated ledger state per test
  await testPool.query('TRUNCATE paid_budget_reservations, paid_budget_days');
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function setBudget(budget: number) {
  await testPool.query(
    `INSERT INTO paid_budget_days (day, budget_usd) VALUES ($1::date, $2)
     ON CONFLICT (day) DO UPDATE SET budget_usd = $2, reserved_usd = 0, settled_usd = 0, released_usd = 0`,
    [utcDay(), budget],
  );
}

async function dayRow() {
  const { rows } = await testPool.query(
    `SELECT budget_usd, reserved_usd, settled_usd, released_usd FROM paid_budget_days WHERE day = $1::date`, [utcDay()],
  );
  return rows[0] ?? null;
}

async function reservation(id: string) {
  const { rows } = await testPool.query(
    `SELECT state, settled_usd, amount_usd, cost_basis FROM paid_budget_reservations WHERE id = $1::uuid`, [id],
  );
  return rows[0] ?? null;
}

before(async () => { await freshSchema(); });
after(async () => { await closePool(); });

// tier1 reservation: (8000 input + 3000 max_tokens) * $0.5/M = $0.0055
const T1 = round6(estimateCostUsd('paid_tier1'));
const T2 = round6(estimateCostUsd('paid_tier2'));

describe('reservation amounts', () => {
  it('reserves maximum plausible exposure (input assumption + max_tokens)', () => {
    assert.equal(T1, 0.0055);
    assert.equal(T2, 0.0165);
  });

  it('applies the configured margin on top', () => {
    process.env.PAID_LLM_RESERVE_MARGIN = '0.5';
    assert.equal(computeReservationAmountUsd('paid_tier1'), 0.00825);
  });
});

describe('reserve', () => {
  it('grants when budget remains and records the reservation row', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr', workItemId: null });
    assert.equal(r.granted, true);
    if (!r.granted) return;
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved');
    assert.equal(Number(row.amount_usd), T1);
    const d = await dayRow();
    assert.equal(Number(d.reserved_usd), T1);
  });

  it('refuses with cap_reached when remaining budget cannot cover the estimate', async () => {
    await setBudget(0.005); // < T1
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.deepEqual(r, { granted: false, reason: 'cap_reached' });
  });

  it('counts SETTLED spend against the cap, not just open reservations', async () => {
    await setBudget(T1 + 0.0001);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.equal(r.granted, true);
    if (!r.granted) return;
    await settleReservation(db, r.reservationId, T1, 'provider_reported_actual');
    // settled T1 now counted; a new reservation of T1 would exceed budget
    const r2 = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.deepEqual(r2, { granted: false, reason: 'cap_reached' });
  });

  it('never reserves for the free tier', async () => {
    // no setBudget here: a free-tier call must not create ledger rows at all
    const r = await reserveForCall(db, { tier: 'free', role: 'writer-vr' });
    assert.deepEqual(r, { granted: false, reason: 'disabled' });
    assert.equal(await dayRow(), null);
  });

  it('fails CLOSED when the ledger is unavailable (accounting_unavailable, never granted)', async () => {
    const broken: LedgerDb = { query: async () => { throw new Error('db down'); } };
    const r = await reserveForCall(broken, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.deepEqual(r, { granted: false, reason: 'accounting_unavailable' });
    assert.equal(await ledgerHealthy(broken), false);
  });
});

describe('concurrent cap enforcement (real Postgres)', () => {
  it('overlapping ticks can never collectively reserve beyond the daily budget', async () => {
    for (let round = 0; round < 5; round++) {
      // budget fits EXACTLY two tier1 reservations
      await setBudget(round6(T1 * 2));
      const calls = Array.from({ length: 8 }, () =>
        reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' }));
      const results = await Promise.all(calls);
      const granted = results.filter(r => r.granted);
      const capped = results.filter(r => !r.granted && r.reason === 'cap_reached');
      assert.equal(granted.length, 2, `round ${round}: expected exactly 2 grants, got ${granted.length}`);
      assert.equal(capped.length, 6, `round ${round}: expected 6 cap rejections`);
      const d = await dayRow();
      assert.ok(Number(d.reserved_usd) <= round6(T1 * 2) + 1e-9, `round ${round}: reserved exceeds budget`);
      assert.equal(round6(Number(d.reserved_usd)), round6(T1 * 2));
      assert.ok(Number(d.reserved_usd) + Number(d.settled_usd) <= round6(T1 * 2) + 1e-9);
    }
  });

  it('15 concurrent callers with budget for exactly one → exactly one grant', async () => {
    await setBudget(T1);
    const results = await Promise.all(Array.from({ length: 15 }, () =>
      reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' })));
    assert.equal(results.filter(r => r.granted).length, 1);
  });
});

describe('settle / release (idempotent reconciliation)', () => {
  it('provider-reported actual replaces the reservation; remainder released', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const s = await settleReservation(db, r.reservationId, 0.002, 'provider_reported_actual');
    assert.equal(s.ok, true);
    if (!s.ok) return;
    assert.equal(s.state, 'settled');
    assert.equal(s.countedUsd, 0.002);
    assert.equal(s.costBasis, 'provider_reported_actual');
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'settled');
    assert.equal(Number(row.settled_usd), 0.002);
    const d = await dayRow();
    assert.equal(Number(d.settled_usd), 0.002);
    assert.equal(round6(Number(d.released_usd)), round6(T1 - 0.002));
    assert.equal(round6(Number(d.reserved_usd)), 0);
  });

  it('no usage reported → conservative estimate retained in full', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier2', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const s = await settleReservation(db, r.reservationId, T2, 'conservative_estimate');
    assert.equal(s.ok, true);
    if (!s.ok) return;
    assert.equal(s.costBasis, 'conservative_estimate');
    const d = await dayRow();
    assert.equal(round6(Number(d.settled_usd)), T2);
    assert.equal(round6(Number(d.released_usd)), 0);
  });

  it('double settle / settle-after-release is refused and changes nothing', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await settleReservation(db, r.reservationId, 0.001, 'provider_reported_actual');
    const again = await settleReservation(db, r.reservationId, 0.009, 'provider_reported_actual');
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.reason, 'already_finalized');
    const d = await dayRow();
    assert.equal(Number(d.settled_usd), 0.001); // unchanged by the refused second settle
    const rel = await releaseReservation(db, r.reservationId);
    assert.equal(rel.ok, false); // already settled — cannot release
  });

  it('release refunds the full reservation (no provider call happened)', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const rel = await releaseReservation(db, r.reservationId);
    assert.equal(rel.ok, true);
    if (!rel.ok) return;
    assert.equal(rel.state, 'released');
    assert.equal(rel.countedUsd, 0);
    const d = await dayRow();
    assert.equal(round6(Number(d.reserved_usd)), 0);
    assert.equal(round6(Number(d.released_usd)), T1);
    assert.equal(Number(d.settled_usd), 0);
    // released budget is spendable again
    const r2 = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.equal(r2.granted, true);
  });
});

describe('ambiguous completion (timeout / restart recovery)', () => {
  it('markReconciliationNeeded retains the reservation as counted spend, flagged for review', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const mr = await markReconciliationNeeded(db, r.reservationId);
    assert.equal(mr.ok, true);
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reconciliation_needed');
    const d = await dayRow();
    assert.equal(round6(Number(d.settled_usd)), T1); // retained — never undercount
    assert.equal(round6(Number(d.reserved_usd)), 0);
    // retained money still counts against the cap
    const r2 = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.equal(r2.granted, true); // $2 budget has room
    await setBudget(T1); // exact-cap check with the retained amount counted
    const r3 = await reserveForCall(db, { tier: 'paid_tier2', role: 'writer-vr' });
    assert.deepEqual(r3, { granted: false, reason: 'cap_reached' });
  });

  it('sweeper recovers reservations orphaned by process death (restart simulation)', async () => {
    await setBudget(2);
    // Simulate a dead process: reservation open with a reserved_at far in the past.
    const { rows } = await testPool.query(
      `WITH d AS (
         INSERT INTO paid_budget_days (day, budget_usd, reserved_usd) VALUES ($1::date, 2, $2)
         ON CONFLICT (day) DO UPDATE SET reserved_usd = paid_budget_days.reserved_usd + $2
         RETURNING day
       )
       INSERT INTO paid_budget_reservations (id, day, role, tier, model, amount_usd, state, reserved_at)
       SELECT gen_random_uuid(), d.day, 'writer-vr', 'paid_tier1', 'deepseek-chat', $2, 'reserved', NOW() - interval '8 hours' FROM d
       RETURNING id, amount_usd`,
      [utcDay(), T1],
    );
    const orphanId = rows[0].id as string;
    const n = await sweepStaleReservations(db);
    assert.ok(n >= 1, 'sweeper should move at least the orphan');
    const row = await reservation(orphanId);
    assert.equal(row.state, 'reconciliation_needed');
    const d = await dayRow();
    assert.equal(round6(Number(d.settled_usd)), T1); // retained, auditable
    assert.equal(round6(Number(d.reserved_usd)), 0);
  });

  it('operator can refund a reconciliation-needed row after investigation', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await markReconciliationNeeded(db, r.reservationId);
    const res = await resolveReconciliation(db, r.reservationId, false);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.state, 'released');
    const d = await dayRow();
    assert.equal(round6(Number(d.settled_usd)), 0);
    assert.equal(round6(Number(d.released_usd)), T1);
  });

  it('sweeper TTL is configurable and defaults to 6h', () => {
    assert.equal(reservationTtlHours(), 6);
    process.env.PAID_LLM_RESERVATION_TTL_HOURS = '12';
    assert.equal(reservationTtlHours(), 12);
  });
});

describe('DB integrity constraints', () => {
  it('agent_runs rejects unknown tiers and negative costs', async () => {
    await assert.rejects(() => testPool.query(
      `INSERT INTO agent_runs (work_item_id, role, prompt_id, prompt_version, mode, input_hash, status, attempt, tier, cost_usd)
       VALUES (NULL, 'writer-vr', 'p', '1', 'shadow', 'h', 'succeeded', 1, 'paid_tier9', 0)`));
    await assert.rejects(() => testPool.query(
      `INSERT INTO agent_runs (work_item_id, role, prompt_id, prompt_version, mode, input_hash, status, attempt, tier, cost_usd)
       VALUES (NULL, 'writer-vr', 'p', '1', 'shadow', 'h', 'succeeded', 1, 'free', -0.01)`));
    // valid paid rows still pass
    await testPool.query(
      `INSERT INTO agent_runs (role, prompt_id, prompt_version, mode, input_hash, status, attempt, tier, cost_usd)
       VALUES ('writer-vr', 'p', '1', 'shadow', 'h', 'succeeded', 3, 'paid_tier1', 0.25)`);
  });

  it('reservation table rejects invalid states, negative amounts, bad cost basis', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await assert.rejects(() => testPool.query(
      `UPDATE paid_budget_reservations SET state = 'bogus' WHERE id = $1::uuid`, [r.reservationId]));
    await assert.rejects(() => testPool.query(
      `INSERT INTO paid_budget_reservations (id, day, tier, amount_usd, state)
       VALUES (gen_random_uuid(), $1::date, 'paid_tier1', -1, 'reserved')`, [utcDay()]));
    await assert.rejects(() => testPool.query(
      `UPDATE paid_budget_reservations SET cost_basis = 'made_up' WHERE id = $1::uuid`, [r.reservationId]));
  });
});

describe('provider timeout leaves budget in a safe state (integration)', () => {
  it('timeout → reservation retained as reconciliation_needed, never released', async () => {
    // LadderInvoker gates on env (not constructor args) — arm the ladder first.
    process.env.PAID_LLM_URL = 'http://armed-but-overridden-by-constructor';
    process.env.PAID_LLM_API_KEY = 'sk-test';
    await setBudget(2);
    // A server that accepts connections but never responds → client timeout.
    const blackhole = http.createServer(() => { /* never reply */ });
    await new Promise<void>(r => blackhole.listen(0, '127.0.0.1', r));
    const port = (blackhole.address() as { port: number }).port;
    try {
      const paid = new PaidOpenAIInvoker(`http://127.0.0.1:${port}/v1/chat/completions`, 'sk-test', 80);
      const echo = new EchoInvoker(new Map());
      echo.setFixture('writer-vr', { status: 'ok', confidence: 0.9, uncertainty: [], escalation: null, payload: {} });
      const inv = new LadderInvoker(echo, paid, db);
      const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
      assert.equal(res.ok, false);
      assert.equal(res.errorKind, 'timeout');
      assert.ok(res.reservation, 'reservation must be tracked');
      assert.equal(res.reservation!.state, 'reconciliation_needed');
      // The conservative reservation is RETAINED (counted spend) — never undercount.
      const d = await dayRow();
      assert.equal(round6(Number(d.settled_usd)), round6(estimateCostUsd('paid_tier1')));
      assert.equal(round6(Number(d.reserved_usd)), 0);
    } finally {
      blackhole.close();
    }
  });
});

describe('accounting status states', () => {
  it('disabled when the ladder is dormant', async () => {
    const s = await accountingStatus(db, false);
    assert.equal(s.status, 'disabled');
    assert.equal(s.summary, null);
  });

  it('accounting-ready with a live summary when armed and budget remains', async () => {
    await setBudget(2);
    const s = await accountingStatus(db, true);
    assert.equal(s.status, 'accounting-ready');
    assert.equal(s.summary?.budgetUsd, 2);
    assert.equal(s.summary?.remainingUsd, 2);
  });

  it('budget-exhausted when remaining hits zero', async () => {
    await setBudget(T1);
    await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    const s = await accountingStatus(db, true);
    assert.equal(s.status, 'budget-exhausted');
    assert.equal(s.summary?.remainingUsd, 0);
  });

  it('accounting-unavailable when the ledger cannot be reached', async () => {
    const broken: LedgerDb = { query: async () => { throw new Error('db down'); } };
    const s = await accountingStatus(broken, true);
    assert.equal(s.status, 'accounting-unavailable');
  });
});
