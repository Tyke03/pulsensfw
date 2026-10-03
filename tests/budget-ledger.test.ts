import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { freshSchema, testPool, closePool } from './setup';
import { PollinationsPaidInvoker, LadderInvoker, EchoInvoker } from '../server/orchestrator/invoker';
import type { AgentInvoker, InvokeMeta, InvokeResult } from '../server/orchestrator/invoker';
import { estimateCostUsd } from '../server/orchestrator/model-ladder';
import {
  reserveForCall, settleReservation, releaseReservation, markReconciliationNeeded,
  sweepStaleReservations, resolveReconciliation, summarizeDay, accountingStatus,
  ledgerHealthy, computeReservationAmountUsd, round6, reservationTtlHours,
  withLedgerTx, ledgerPoolHealth, ledgerPoolMax, ledgerConnectionTimeoutMs,
  ledgerIdleTimeoutMs, ledgerLockTimeoutMs, ledgerStatementTimeoutMs, ledgerQueryTimeoutMs,
  getLedgerDb, isTransactionCapableLedgerDb,
  type LedgerDb,
} from '../server/orchestrator/budget-ledger';
import { utcDay, dailyBudgetUsd, LADDER, estimateCostUsd } from '../server/orchestrator/model-ladder';

const db = testPool as unknown as LedgerDb;

const ENV_KEYS = ['POLLINATIONS_API_KEY', 'POLLINATIONS_DAILY_BUDGET_USD', 'POLLINATIONS_RESERVE_MARGIN', 'POLLINATIONS_RESERVATION_TTL_HOURS', 'POLLINATIONS_TIMEOUT_MS', 'POLLINATIONS_MAX_TOKENS_TIER1', 'POLLINATIONS_MAX_TOKENS_TIER2', 'POLLINATIONS_ESCALATE_AFTER_ATTEMPT'] as const;
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

// tier1 reservation: (8000 input × 0.0000001 + 3000 max_tokens × 0.0000005) Pollen × $1/Pollen = $0.0023
const T1 = round6(estimateCostUsd('paid_tier1'));
const T2 = round6(estimateCostUsd('paid_tier2'));

describe('reservation amounts', () => {
  it('reserves maximum plausible exposure (input assumption + max_tokens)', () => {
    assert.equal(T1, 0.0023);
    assert.equal(T2, 0.046);
  });

  it('applies the configured margin on top', () => {
    process.env.POLLINATIONS_RESERVE_MARGIN = '0.5';
    assert.equal(computeReservationAmountUsd('paid_tier1'), 0.00345);
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
    await setBudget(T1 - 0.0001); // < T1
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.deepEqual(r, { granted: false, reason: 'cap_reached' });
  });

  it('counts SETTLED spend against the cap, not just open reservations', async () => {
    await setBudget(T1 + 0.0001);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    assert.equal(r.granted, true);
    if (!r.granted) return;
    await settleReservation(db, r.reservationId, T1, 'provider_usage_derived_estimate');
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
    const s = await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.equal(s.ok, true);
    if (!s.ok) return;
    assert.equal(s.state, 'settled');
    assert.equal(s.countedUsd, 0.002);
    assert.equal(s.costBasis, 'provider_usage_derived_estimate');
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
    const s = await settleReservation(db, r.reservationId, T2, 'conservative_reservation_estimate');
    assert.equal(s.ok, true);
    if (!s.ok) return;
    assert.equal(s.costBasis, 'conservative_reservation_estimate');
    const d = await dayRow();
    assert.equal(round6(Number(d.settled_usd)), T2);
    assert.equal(round6(Number(d.released_usd)), 0);
  });

  it('double settle / settle-after-release is refused and changes nothing', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await settleReservation(db, r.reservationId, 0.001, 'provider_usage_derived_estimate');
    const again = await settleReservation(db, r.reservationId, 0.009, 'provider_usage_derived_estimate');
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
    if (mr.ok) assert.equal(mr.countedUsd, T1); // returns the REAL retained amount
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
       SELECT gen_random_uuid(), d.day, 'writer-vr', 'paid_tier1', 'openai/gpt-6-luna', $2, 'reserved', NOW() - interval '8 hours' FROM d
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
    process.env.POLLINATIONS_RESERVATION_TTL_HOURS = '12';
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

// ── Explicit-transaction finalization (corrective design) ────────────────────

/**
 * Fault-injecting LedgerDb that still uses the REAL pool via a checked-out
 * client (satisfies LedgerClientProvider). `fault` returns true to throw for a
 * given statement, letting tests inject failures at exact transaction points.
 */
function makeFaultyDb(fault: (text: string) => boolean): LedgerDb {
  return {
    query: (text: string, values?: unknown[]) => testPool.query(text, values),
    connect: async () => {
      const real = await testPool.connect();
      return {
        query: async (text: string, values?: unknown[]) => {
          if (fault(text)) throw new Error(`injected failure at: ${text.slice(0, 60)}`);
          return real.query(text, values);
        },
        release: () => real.release(),
      };
    },
  } as unknown as LedgerDb;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** A LedgerDb whose connect() always fails — models an exhausted/saturated pool. */
function makeAcquireBrokenDb(): LedgerDb {
  return {
    query: (text: string, values?: unknown[]) => testPool.query(text, values),
    connect: async () => { throw new Error('connection timeout: pool exhausted (LEDGER_DB_CONNECTION_TIMEOUT_MS)'); },
  } as unknown as LedgerDb;
}

/** Same paid-stub used by the ladder routing suite (counts invocations). */
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

async function expectDayEquals(expected: { reserved: number; settled: number; released: number }) {
  const d = await dayRow();
  assert.ok(d, 'day row must exist');
  assert.equal(round6(Number(d!.reserved_usd)), round6(expected.reserved));
  assert.equal(round6(Number(d!.settled_usd)), round6(expected.settled));
  assert.equal(round6(Number(d!.released_usd)), round6(expected.released));
}

/** Consistency audit: day aggregates must agree with reservation states. */
async function auditLedgerDay(day: string): Promise<{ ok: boolean; issues: string[] }> {
  const { rows } = await testPool.query(
    `SELECT
       (SELECT COALESCE(SUM(amount_usd), 0) FROM paid_budget_reservations WHERE day = $1::date AND state = 'reserved') AS res_reserved,
       (SELECT COALESCE(SUM(CASE WHEN state = 'settled' THEN COALESCE(settled_usd, amount_usd)
                                 WHEN state = 'reconciliation_needed' THEN amount_usd ELSE 0 END), 0)
          FROM paid_budget_reservations WHERE day = $1::date) AS res_settled,
       (SELECT COALESCE(SUM(CASE WHEN state = 'released' THEN amount_usd
                                 WHEN state = 'settled' THEN GREATEST(amount_usd - COALESCE(settled_usd, amount_usd), 0) ELSE 0 END), 0)
          FROM paid_budget_reservations WHERE day = $1::date) AS res_released,
       budget_usd, reserved_usd, settled_usd, released_usd
      FROM paid_budget_days WHERE day = $1::date`,
    [day],
  );
  if (rows.length === 0) return { ok: true, issues: [] };
  const r = rows[0];
  const issues: string[] = [];
  if (round6(Number(r.reserved_usd)) !== round6(Number(r.res_reserved))) issues.push(`reserved aggregate ${r.reserved_usd} != reservation sum ${r.res_reserved}`);
  if (round6(Number(r.settled_usd)) !== round6(Number(r.res_settled))) issues.push(`settled aggregate ${r.settled_usd} != reservation sum ${r.res_settled}`);
  if (round6(Number(r.released_usd)) !== round6(Number(r.res_released))) issues.push(`released aggregate ${r.released_usd} != reservation sum ${r.res_released}`);
  if (Number(r.reserved_usd) < 0 || Number(r.settled_usd) < 0 || Number(r.released_usd) < 0) issues.push('negative aggregate');
  if (round6(Number(r.reserved_usd) + Number(r.settled_usd)) > round6(Number(r.budget_usd)) + 1e-9) issues.push('reserved + settled exceeds budget');
  return { ok: issues.length === 0, issues };
}

describe('explicit-transaction finalization (corrective design)', () => {
  it('settle updates reservation and day aggregate together', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const s = await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.equal(s.ok, true);
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'settled');
    await expectDayEquals({ reserved: 0, settled: 0.002, released: round6(T1 - 0.002) });
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('release updates reservation and day aggregate together', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier2', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const rel = await releaseReservation(db, r.reservationId);
    assert.equal(rel.ok, true);
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'released');
    await expectDayEquals({ reserved: 0, settled: 0, released: T2 });
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('markReconciliationNeeded updates reservation and day aggregate together and returns the retained amount', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const mr = await markReconciliationNeeded(db, r.reservationId);
    assert.equal(mr.ok, true);
    if (mr.ok) {
      assert.equal(mr.state, 'reconciliation_needed');
      assert.equal(mr.countedUsd, T1); // positive, real amount — never a sentinel
      assert.ok(mr.countedUsd > 0);
    }
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reconciliation_needed');
    await expectDayEquals({ reserved: 0, settled: T1, released: 0 });
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('resolveReconciliation retain=true → settled, day amounts unchanged', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await markReconciliationNeeded(db, r.reservationId);
    const res = await resolveReconciliation(db, r.reservationId, true);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.state, 'settled');
    await expectDayEquals({ reserved: 0, settled: T1, released: 0 });
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('resolveReconciliation retain=false → released, day settled −A and released +A', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await markReconciliationNeeded(db, r.reservationId);
    const res = await resolveReconciliation(db, r.reservationId, false);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.state, 'released');
      assert.equal(res.countedUsd, 0);
    }
    await expectDayEquals({ reserved: 0, settled: 0, released: T1 });
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('ROLLBACK: exception at day-row lock (after reservation lock) leaves both rows untouched', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const faulty = makeFaultyDb((text) => /FROM paid_budget_days WHERE day = \$1::date FOR UPDATE/.test(text));
    const s = await settleReservation(faulty, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.deepEqual(s, { ok: false, reason: 'accounting_unavailable' });
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved', 'reservation must roll back to reserved');
    await expectDayEquals({ reserved: T1, settled: 0, released: 0 });
  });

  it('ROLLBACK: exception after day lock but before reservation finalization leaves both rows untouched', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const faulty = makeFaultyDb((text) => /UPDATE paid_budget_reservations/.test(text));
    const s = await releaseReservation(faulty, r.reservationId);
    assert.deepEqual(s, { ok: false, reason: 'accounting_unavailable' });
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved', 'reservation must roll back to reserved');
    await expectDayEquals({ reserved: T1, settled: 0, released: 0 });
  });

  it('ROLLBACK: exception after reservation update but before day update leaves both rows untouched', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const faulty = makeFaultyDb((text) => /UPDATE paid_budget_days/.test(text));
    const s = await settleReservation(faulty, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.deepEqual(s, { ok: false, reason: 'accounting_unavailable' });
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved', 'reservation update must roll back');
    await expectDayEquals({ reserved: T1, settled: 0, released: 0 });
    assert.ok((await auditLedgerDay(utcDay())).ok, 'audit must stay clean after rollback');
  });

  it('double-finalize cannot double-count', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const first = await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.equal(first.ok, true);
    const second = await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, 'already_finalized');
    await expectDayEquals({ reserved: 0, settled: 0.002, released: round6(T1 - 0.002) });
  });

  it('concurrent finalize attempts cannot double-count or double-release', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    // Three racing finalizers with DIFFERENT effects; exactly one may win.
    const outcomes = await Promise.all([
      settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate'),
      settleReservation(db, r.reservationId, 0.004, 'provider_usage_derived_estimate'),
      releaseReservation(db, r.reservationId),
    ]);
    const winners = outcomes.filter(o => o.ok);
    assert.equal(winners.length, 1, `exactly one finalizer must win, got ${winners.length}`);
    const row = await reservation(r.reservationId);
    const d = await dayRow();
    if (winners[0]!.state === 'released') {
      assert.equal(row.state, 'released');
      await expectDayEquals({ reserved: 0, settled: 0, released: T1 });
    } else {
      assert.equal(row.state, 'settled');
      // whichever settle won, its amount — and only its amount — was counted
      const counted = winners[0]!.countedUsd;
      assert.equal(Number(row.settled_usd), counted);
      await expectDayEquals({ reserved: 0, settled: counted, released: round6(T1 - counted) });
    }
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('aggregates stay non-negative and reserved+settled never exceeds budget across a full lifecycle', async () => {
    await setBudget(round6(T1 + T2)); // exactly covers both planned reservations
    const a = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    const b = await reserveForCall(db, { tier: 'paid_tier2', role: 'writer-vr' });
    assert.ok(a.granted && b.granted);
    if (!(a.granted && b.granted)) return;
    await settleReservation(db, a.reservationId, 0.001, 'provider_usage_derived_estimate');
    await markReconciliationNeeded(db, b.reservationId);
    await resolveReconciliation(db, b.reservationId, false);
    const d = await dayRow();
    assert.ok(Number(d!.reserved_usd) >= 0 && Number(d!.settled_usd) >= 0 && Number(d!.released_usd) >= 0);
    assert.ok(Number(d!.reserved_usd) + Number(d!.settled_usd) <= round6(T1 * 2) + 1e-9);
    const audit = await auditLedgerDay(utcDay());
    assert.ok(audit.ok, audit.issues.join('; '));
  });

  it('consistency audit detects every corruption class', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.ok((await auditLedgerDay(utcDay())).ok, 'clean state must pass');
    const day = utcDay();
    // reserved not represented in the day aggregate (shifted upward; the DB
    // CHECK blocks driving an aggregate below zero, so the mismatch is created
    // on the safe side and the AUDIT — not the schema — must catch it)
    await testPool.query('UPDATE paid_budget_days SET reserved_usd = reserved_usd + 0.0001 WHERE day = $1::date', [day]);
    assert.equal((await auditLedgerDay(day)).ok, false);
    await testPool.query('UPDATE paid_budget_days SET reserved_usd = reserved_usd - 0.0001 WHERE day = $1::date', [day]);
    // settled not represented
    await testPool.query('UPDATE paid_budget_days SET settled_usd = settled_usd - 0.0001 WHERE day = $1::date', [day]);
    assert.equal((await auditLedgerDay(day)).ok, false);
    await testPool.query('UPDATE paid_budget_days SET settled_usd = settled_usd + 0.0001 WHERE day = $1::date', [day]);
    // released not represented
    await testPool.query('UPDATE paid_budget_days SET released_usd = released_usd - 0.0001 WHERE day = $1::date', [day]);
    assert.equal((await auditLedgerDay(day)).ok, false);
    await testPool.query('UPDATE paid_budget_days SET released_usd = released_usd + 0.0001 WHERE day = $1::date', [day]);
    // negative aggregate (CHECK lifted briefly — the audit must catch what the
    // schema normally prevents)
    await testPool.query('ALTER TABLE paid_budget_days DROP CONSTRAINT paid_budget_days_settled_usd_check');
    await testPool.query('UPDATE paid_budget_days SET settled_usd = -0.01 WHERE day = $1::date', [day]);
    let audit = await auditLedgerDay(day);
    assert.ok(audit.issues.some(i => i === 'negative aggregate'));
    await testPool.query('UPDATE paid_budget_days SET settled_usd = 0.002 WHERE day = $1::date', [day]);
    await testPool.query('ALTER TABLE paid_budget_days ADD CONSTRAINT paid_budget_days_settled_usd_check CHECK (settled_usd >= 0)');
    // reserved + settled over budget
    await testPool.query('UPDATE paid_budget_days SET budget_usd = 0.001 WHERE day = $1::date', [day]);
    audit = await auditLedgerDay(day);
    assert.ok(audit.issues.some(i => i.includes('exceeds budget')));
  });

  it('cost-basis labels reflect the evidence source (DB CHECK + invoker semantics)', async () => {
    await setBudget(2);
    // derived-from-usage and conservative sizing are accepted…
    for (const basis of ['provider_usage_derived_estimate', 'conservative_reservation_estimate']) {
      await testPool.query(
        `INSERT INTO paid_budget_reservations (id, day, tier, amount_usd, state, settled_usd, cost_basis, finalized_at)
         VALUES (gen_random_uuid(), $1::date, 'paid_tier1', 0.0055, 'settled', 0.002, $2, NOW())`,
        [utcDay(), basis],
      );
    }
    // …the over-claiming legacy label is not (for new rows)…
    await assert.rejects(() => testPool.query(
      `INSERT INTO paid_budget_reservations (id, day, tier, amount_usd, state, settled_usd, cost_basis, finalized_at)
       VALUES (gen_random_uuid(), $1::date, 'paid_tier1', 0.0055, 'settled', 0.002, 'provider_reported_actual', NOW())`,
      [utcDay()],
    ));
    // …and made-up labels are rejected.
    await assert.rejects(() => testPool.query(
      `INSERT INTO paid_budget_reservations (id, day, tier, amount_usd, state, settled_usd, cost_basis, finalized_at)
       VALUES (gen_random_uuid(), $1::date, 'paid_tier1', 0.0055, 'settled', 0.002, 'made_up', NOW())`,
      [utcDay()],
    ));
    // Invoker: usage ⇒ provider_usage_derived_estimate; no usage ⇒ conservative_reservation_estimate.
    const withUsage = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
    });
    const withoutUsage = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }] }));
    });
    for (const [server, expected] of [[withUsage, 'provider_usage_derived_estimate'], [withoutUsage, 'conservative_reservation_estimate']] as const) {
      await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
      const port = (server.address() as { port: number }).port;
      try {
        const paid = new PollinationsPaidInvoker(`http://127.0.0.1:${port}/v1/chat/completions`, 'sk-test', 2000);
        const res = await paid.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
        assert.equal(res.ok, true);
        assert.equal(res.costBasis, expected);
      } finally {
        server.close();
      }
    }
  });
});

describe('provider timeout leaves budget in a safe state (integration)', () => {
  it('timeout → reservation retained as reconciliation_needed, never released', async () => {
    // LadderInvoker gates on env (not constructor args) — arm the ladder first.
    process.env.POLLINATIONS_API_KEY = 'sk-test';
    await setBudget(2);
    // A server that accepts connections but never responds → client timeout.
    const blackhole = http.createServer(() => { /* never reply */ });
    await new Promise<void>(r => blackhole.listen(0, '127.0.0.1', r));
    const port = (blackhole.address() as { port: number }).port;
    try {
      const paid = new PollinationsPaidInvoker(`http://127.0.0.1:${port}/v1/chat/completions`, 'sk-test', 80);
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

// ── Pool hardening (round 3): bounded acquisition, bounded tx, safe telemetry ─

describe('ledger pool hardening', () => {
  it('acquisition failure (connect timeout) → free fallback, accountingFallback=true, zero paid calls', async () => {
    process.env.POLLINATIONS_API_KEY = 'sk-test';
    await setBudget(2); // budget available — the failure must be acquisition-only
    const paid = new StubPaidInvoker();
    const inv = new LadderInvoker(makeFreeEcho(), paid, makeAcquireBrokenDb());
    const res = await inv.invoke({}, 'sys', { role: 'writer-vr', promptId: 'p', promptVersion: '1', mode: 'shadow', tier: 'paid_tier1' });
    assert.equal(paid.calls, 0, 'paid invoker must never be called when acquisition fails');
    assert.equal(res.tier, 'free');
    assert.equal(res.costUsd, 0);
    assert.equal(res.accountingFallback, true);
    assert.equal(res.budgetFallback, undefined);
    const { rows } = await testPool.query(`SELECT count(*)::int AS n FROM paid_budget_reservations`);
    assert.equal(rows[0].n, 0, 'no reservation may be created');
  });

  it('lock timeout → transaction rolls back, client released, reservation untouched', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    // Real second client holds FOR UPDATE on the reservation row; the
    // finalizer's lock wait must abort via lock_timeout (SET LOCAL in
    // withLedgerTx) — not hang, and not leave the tx open.
    const blocker = await testPool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(`SELECT * FROM paid_budget_reservations WHERE id = $1::uuid FOR UPDATE`, [r.reservationId]);
      const blocked = settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
      const s = await Promise.race([
        blocked.then(() => 'settled'),
        delay(12_000).then(() => 'timeout'),
      ]);
      assert.notEqual(s, 'timeout', 'settle must abort via lock_timeout, not hang');
      assert.deepEqual(await blocked, { ok: false, reason: 'accounting_unavailable' });
    } finally {
      await blocker.query('ROLLBACK').catch(() => {});
      blocker.release();
    }
    // The abort released the ledger client — a normal finalization works after.
    const retry = await settleReservation(db, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.equal(retry.ok, true, 'client must have been released after the lock abort');
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'settled');
    const d = await dayRow();
    assert.equal(Number(d.settled_usd), 0.002); // exactly one apply — abort rolled back
    assert.ok((await auditLedgerDay(utcDay())).ok);
  });

  it('stalled statement → statement_timeout aborts, tx rolls back, client released', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const faulty = makeFaultyDb((text) => /UPDATE paid_budget_reservations/.test(text));
    const s = await settleReservation(faulty, r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.deepEqual(s, { ok: false, reason: 'accounting_unavailable' });
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved', 'reservation must roll back to reserved');
    await expectDayEquals({ reserved: T1, settled: 0, released: 0 });
    assert.ok((await auditLedgerDay(utcDay())).ok, 'audit must stay clean after abort');
  });

  it('pool health payload contains ONLY safe numeric fields (no DSN/host/user/db/SQL)', async () => {
    const health = ledgerPoolHealth(db);
    const keys = Object.keys(health).sort();
    assert.deepEqual(keys, [
      'connectionTimeoutMs', 'idleClients', 'idleTimeoutMs', 'lockTimeoutMs',
      'poolMax', 'statementTimeoutMs', 'totalClients', 'waitingClients',
    ]);
    for (const [k, v] of Object.entries(health)) {
      assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v)), `${k} must be numeric-or-null, got ${typeof v}`);
    }
    const serialized = JSON.stringify(health).toLowerCase();
    for (const forbidden of ['postgres', 'host', 'user', 'database', 'password', 'token', 'select', 'query', 'dsn', 'ssl']) {
      assert.ok(!serialized.includes(forbidden), `pool health must not contain '${forbidden}'`);
    }
  });

  it('pool config helpers: env overrides clamp to safe ranges, invalid values fall back', () => {
    const saved: Record<string, string | undefined> = {};
    const KEYS = ['LEDGER_DB_POOL_MAX', 'LEDGER_DB_CONNECTION_TIMEOUT_MS', 'LEDGER_DB_IDLE_TIMEOUT_MS', 'LEDGER_DB_QUERY_TIMEOUT_MS', 'LEDGER_DB_LOCK_TIMEOUT_MS', 'LEDGER_DB_STATEMENT_TIMEOUT_MS'];
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    try {
      assert.equal(ledgerPoolMax(), 3); // conservative default
      assert.equal(ledgerConnectionTimeoutMs(), 5000);
      assert.equal(ledgerIdleTimeoutMs(), 30000);
      assert.equal(ledgerLockTimeoutMs(), 4000);
      assert.equal(ledgerStatementTimeoutMs(), 5000);
      assert.equal(ledgerQueryTimeoutMs(), null); // opt-in watchdog
      process.env.LEDGER_DB_POOL_MAX = '0';
      assert.equal(ledgerPoolMax(), 3); // invalid → default
      process.env.LEDGER_DB_POOL_MAX = '99';
      assert.equal(ledgerPoolMax(), 3); // out of range → default (all-or-nothing, no silent clamping)
      process.env.LEDGER_DB_POOL_MAX = '20';
      assert.equal(ledgerPoolMax(), 20); // hard-cap boundary accepted
      process.env.LEDGER_DB_POOL_MAX = '1';
      assert.equal(ledgerPoolMax(), 1); // hard-floor boundary accepted
      process.env.LEDGER_DB_POOL_MAX = '7.9';
      assert.equal(ledgerPoolMax(), 7); // floored
      process.env.LEDGER_DB_CONNECTION_TIMEOUT_MS = '-1';
      assert.equal(ledgerConnectionTimeoutMs(), 5000); // invalid → default
      process.env.LEDGER_DB_QUERY_TIMEOUT_MS = '1500';
      assert.equal(ledgerQueryTimeoutMs(), 1500); // armed when set
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it('withLedgerTx releases the client when fn throws (no leak across failures)', async () => {
    await setBudget(2);
    let observed: { total: number | null; idle: number | null; waiting: number | null } | null = null;
    await assert.rejects(
      () => withLedgerTx(db, async () => { throw new Error('boom inside tx'); }),
      /boom inside tx/,
    );
    // The checked-out client must be back in the pool by now (idle, none waiting).
    for (let i = 0; i < 50 && (observed = ledgerPoolHealth(db)).totalClients !== observed?.idleClients; i++) {
      await delay(20);
    }
    observed = ledgerPoolHealth(db);
    assert.equal(observed.waitingClients, 0);
    assert.equal(observed.idleClients, observed.totalClients, 'no client may remain checked out after the failure');
    // The pool is usable again.
    assert.equal(await ledgerHealthy(db), true);
  });
});

// ── Production safety: transaction-capable ledger wiring is mandatory ────────

describe('production safety — transaction-capable ledger wiring', () => {
  /**
   * Working query surface with NO connect() — simulates the wiring failure
   * where a query-only double or wrapper is handed to the ledger in
   * production. Its queries genuinely succeed, so the ONLY thing standing
   * between this db and silent non-transactional ledger writes is the
   * transaction-capability guard.
   */
  function makeQueryOnlyDb(): LedgerDb {
    return { query: (text: string, values?: unknown[]) => testPool.query(text, values) };
  }

  it('getLedgerDb() returns a transaction-capable provider exposing connect()', () => {
    const ledger = getLedgerDb();
    assert.equal(typeof (ledger as Partial<{ connect: unknown }>).connect, 'function');
    assert.equal(isTransactionCapableLedgerDb(ledger), true);
  });

  it('isTransactionCapableLedgerDb distinguishes pool-like from query-only surfaces', () => {
    assert.equal(isTransactionCapableLedgerDb(makeQueryOnlyDb()), false);
  });

  it('withLedgerTx refuses a query-only db instead of running non-transactionally', async () => {
    await setBudget(2);
    await assert.rejects(
      () => withLedgerTx(makeQueryOnlyDb(), async (tx) => { await tx.query('SELECT 1'); }),
      /ledger_db_not_transaction_capable/,
    );
  });

  it('wiring failure: reserve through a query-only db is refused, never silently non-transactional', async () => {
    await setBudget(2);
    const r = await reserveForCall(makeQueryOnlyDb(), { tier: 'paid_tier1', role: 'writer-vr' });
    assert.deepEqual(r, { granted: false, reason: 'accounting_unavailable' });
    // No silent side effects: the refused path must not have written ledger state.
    const d = await dayRow();
    assert.ok(d, 'setBudget day row exists');
    assert.equal(Number(d!.reserved_usd), 0, 'no reserve debit may be written without a transaction');
    const { rows } = await testPool.query(`SELECT COUNT(*)::int AS n FROM paid_budget_reservations`);
    assert.equal(rows[0].n, 0, 'no reservation row may be written without a transaction');
  });

  it('wiring failure: settle through a query-only db is refused and ledger state is untouched', async () => {
    await setBudget(2);
    const r = await reserveForCall(db, { tier: 'paid_tier1', role: 'writer-vr' });
    if (!r.granted) return assert.fail('should grant');
    const s = await settleReservation(makeQueryOnlyDb(), r.reservationId, 0.002, 'provider_usage_derived_estimate');
    assert.deepEqual(s, { ok: false, reason: 'accounting_unavailable' });
    const row = await reservation(r.reservationId);
    assert.equal(row.state, 'reserved', 'reservation must stay reserved');
    await expectDayEquals({ reserved: T1, settled: 0, released: 0 });
  });

  it('accountingStatus reports accounting-unavailable for a query-only db (not silently ready)', async () => {
    await setBudget(2);
    const s = await accountingStatus(makeQueryOnlyDb(), true);
    assert.equal(s.status, 'accounting-unavailable');
    assert.equal(s.summary, null);
  });

  it('sweep through a query-only db reports the fail-closed signal (-1)', async () => {
    assert.equal(await sweepStaleReservations(makeQueryOnlyDb()), -1);
  });
});
