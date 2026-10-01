/**
 * budget-ledger.ts — durable, atomic daily budget ledger for paid-model calls.
 *
 * Enforces the daily paid-spend cap via Postgres row-level RESERVATIONS rather
 * than read-then-write aggregates. Every mutation is a SINGLE guarded SQL
 * statement (CTE form), so it is atomic without explicit transactions: the
 * day-row debit and the reservation row are written together or not at all,
 * and the guard `budget_usd - reserved_usd - settled_usd >= amount` serializes
 * concurrent callers on the day row lock (READ COMMITTED re-check). Overlapping
 * orchestrator ticks can never collectively exceed PAID_LLM_DAILY_BUDGET_USD.
 * Cost is reserved conservatively BEFORE the provider call and reconciled
 * (settle/release) after it.
 *
 * Fail-closed invariant: if the ledger cannot be read or written, paid
 * escalation is REFUSED and the call falls back to free tier. The ledger never
 * permits paid use when accounting is unavailable — it only blocks it.
 *
 * Cost basis semantics (recorded per reservation) — labels state the EVIDENCE,
 * never overstate it:
 *  - 'provider_usage_derived_estimate' — token usage from the provider response
 *    converted at locally configured blended rates. This is a derived estimate,
 *    NOT a provider bill.
 *  - 'conservative_reservation_estimate' — maximum plausible exposure
 *    (reservation input assumption + tier max_tokens); used when no usage is
 *    available.
 *  - 'provider_billed_actual' — RESERVED for a provider-returned billed-cost
 *    field consumed verbatim; no code path currently produces it (the CHECK
 *    accepts it for forward compatibility and legacy-row migration).
 * agent_runs.cost_usd records derived-or-conservative-estimated cost; the
 * operator contract lives in docs/RUNTIME.md.
 *
 * Finalization (settle/release/reconcile) runs as EXPLICIT TRANSACTIONS on a
 * single checked-out pool client: BEGIN → lock the reservation row FOR UPDATE →
 * verify source state → lock the day row FOR UPDATE → verify invariants →
 * update reservation → update day aggregate → verify row counts and
 * invariants → COMMIT. Any error rolls back BOTH rows atomically. Multi-row
 * mutations never run through the pool query interface.
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Tier, CostBasis } from './model-ladder';
import { tierFor, estimateCostUsd, dailyBudgetUsd, utcDay } from './model-ladder';

export type { CostBasis } from './model-ladder';

/** Narrow DB surface; satisfied by a pg Pool (or the drizzle client's pool). */
export interface LedgerDb {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/**
 * Transaction surface. A real pg Pool satisfies this via `connect()`; the
 * ledger runs every multi-row mutation on ONE checked-out client so all
 * statements share a connection and transaction.
 */
export interface LedgerTx {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}
export interface LedgerClientProvider {
  connect(): Promise<{ release(): void } & LedgerTx>;
}

/**
 * Run `fn` as a single explicit transaction on ONE checked-out client.
 * COMMIT on success; ROLLBACK on any error (the original error is rethrown).
 * The client is released in `finally` in every path.
 */
export async function withLedgerTx<T>(
  db: LedgerDb,
  fn: (tx: LedgerTx) => Promise<T>,
): Promise<T> {
  const provider = db as Partial<LedgerClientProvider>;
  if (typeof provider.connect !== 'function') {
    // No client provider (e.g. minimal test double): run statements directly on
    // the supplied surface. Multi-row atomicity then degrades to caller
    // responsibility — production pools always take the checked-out path.
    return fn(db);
  }
  const client = await provider.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Non-negative aggregates and the daily cap invariant. */
function dayInvariantsOk(budget: number, reserved: number, settled: number, released: number): boolean {
  return reserved >= 0 && settled >= 0 && released >= 0
    && round6(reserved + settled) <= round6(budget) + 1e-9;
}

export type FinalizeSourceState = 'reserved' | 'reconciliation_needed';

/**
 * Shared explicit-transaction finalizer. Locks the reservation row, verifies
 * the required source state, locks the day row, applies caller mutations,
 * verifies exactly-one-row updates and post-mutation invariants, and commits.
 * Errors (including wrong source state) propagate for per-function mapping.
 */
async function finalizeReservationTx(
  db: LedgerDb,
  reservationId: string,
  requiredState: FinalizeSourceState,
  apply: (tx: LedgerTx, res: { day: string; amountUsd: number }) => Promise<void>,
): Promise<{ day: string; amountUsd: number }> {
  // withLedgerTx opens the transaction (BEGIN) on the checked-out client and
  // commits/rolls back around this callback.
  return withLedgerTx(db, async (tx) => {
    const cur = await tx.query(
      `SELECT day::text AS day, amount_usd, state
         FROM paid_budget_reservations WHERE id = $1::uuid FOR UPDATE`,
      [reservationId],
    );
    if ((cur.rowCount ?? 0) !== 1) throw new Error('reservation not found');
    const row = cur.rows[0];
    if (row.state !== requiredState) throw new Error(`already_finalized:${row.state}`);
    const amountUsd = Number(row.amount_usd);
    const dayAgg = await tx.query(
      `SELECT budget_usd, reserved_usd, settled_usd, released_usd
         FROM paid_budget_days WHERE day = $1::date FOR UPDATE`,
      [row.day],
    );
    if ((dayAgg.rowCount ?? 0) !== 1) throw new Error('day row missing');
    const before = dayAgg.rows[0];
    if (!dayInvariantsOk(Number(before.budget_usd), Number(before.reserved_usd), Number(before.settled_usd), Number(before.released_usd))) {
      throw new Error('day invariants violated before mutation');
    }
    await apply(tx, { day: row.day, amountUsd });
    const after = await tx.query(
      `SELECT budget_usd, reserved_usd, settled_usd, released_usd
         FROM paid_budget_days WHERE day = $1::date`,
      [row.day],
    );
    if ((after.rowCount ?? 0) !== 1) throw new Error('day row missing after update');
    const d = after.rows[0];
    if (!dayInvariantsOk(Number(d.budget_usd), Number(d.reserved_usd), Number(d.settled_usd), Number(d.released_usd))) {
      throw new Error('day invariants violated after mutation');
    }
    return { day: row.day as string, amountUsd };
  });
}

let singleton: LedgerDb | null = null;
/** Module-singleton pool built from DATABASE_URL (same SSL rules as db.ts). */
export function getLedgerDb(): LedgerDb {
  if (singleton) return singleton;
  const isLocal = /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
  singleton = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 3,
  });
  return singleton;
}

export type ReservationState = 'reserved' | 'settled' | 'released' | 'reconciliation_needed';

export type ReserveOutcome =
  | { granted: true; reservationId: string; day: string; amountUsd: number }
  | { granted: false; reason: 'cap_reached' | 'accounting_unavailable' | 'disabled' };

export type FinalizeOutcome =
  | { ok: true; state: 'settled' | 'released' | 'reconciliation_needed'; countedUsd: number; costBasis: CostBasis | null }
  | { ok: false; reason: 'already_finalized' | 'accounting_unavailable'; state?: ReservationState };

/** Extra headroom added on top of the estimate when reserving (0..1). */
export function reserveMarginFraction(): number {
  const v = Number(process.env.PAID_LLM_RESERVE_MARGIN);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0;
}

/** Sweeper releases/retains stale reservations after this many hours. */
export function reservationTtlHours(): number {
  const v = Number(process.env.PAID_LLM_RESERVATION_TTL_HOURS);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 6;
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Conservative reservation amount: maximum plausible exposure for the call
 * (reservation input assumption + tier max_tokens at the tier's blended rate),
 * plus the configured margin. This is what the ledger holds before the call.
 */
export function computeReservationAmountUsd(tier: Tier, estInputTokens?: number, maxOutputTokens?: number): number {
  const amount = estimateCostUsd(tier, estInputTokens, maxOutputTokens);
  return round6(amount * (1 + reserveMarginFraction()));
}

/**
 * Trustworthy ledger health: true only when a trivial query succeeds.
 * This is the fail-closed gate — DB down ⇒ false ⇒ paid refused.
 */
export async function ledgerHealthy(db: LedgerDb): Promise<boolean> {
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically reserve budget for one paid call.
 *
 * Statement 1 — authorization + debit in ONE guarded upsert: on a fresh day it
 * inserts the day row WITH the debit included; on an existing day the
 * ON CONFLICT DO UPDATE's WHERE re-checks the cap under the row lock, so
 * concurrent callers serialize on the unique index and the cap is exact.
 * rowCount 0 ⇒ cap reached; SQL error ⇒ accounting unavailable (fail-closed).
 *
 * Statement 2 — the reservation audit row (FK to the day row). If it fails we
 * refund our own debit best-effort and refuse paid use: worst case is an
 * orphan debit, which can only ever TIGHTEN the cap, never exceed it.
 */
export async function reserveForCall(
  db: LedgerDb,
  args: { tier: Tier; workItemId?: number | null; role?: string | null; model?: string | null },
  now = new Date(),
): Promise<ReserveOutcome> {
  const tierDef = tierFor(args.tier);
  if (tierDef.id === 'free') return { granted: false, reason: 'disabled' };
  const day = utcDay(now);
  const amount = computeReservationAmountUsd(tierDef.id);
  const id = cryptoRandomId();
  try {
    return await withLedgerTx(db, async (tx) => {
      // Authorization + debit in ONE guarded upsert: on a fresh day it inserts
      // the day row WITH the debit; on an existing day the ON CONFLICT DO
      // UPDATE's WHERE re-checks the cap under the row lock, so concurrent
      // callers serialize on the unique index and the cap is exact.
      const r = await tx.query(
        `INSERT INTO paid_budget_days (day, budget_usd, reserved_usd)
         VALUES ($1::date, $2, $3)
         ON CONFLICT (day) DO UPDATE
           SET reserved_usd = paid_budget_days.reserved_usd + $3,
               updated_at = NOW()
         WHERE paid_budget_days.budget_usd - paid_budget_days.reserved_usd - paid_budget_days.settled_usd >= $3
         RETURNING day::text AS day, reserved_usd`,
        [day, dailyBudgetUsd(), amount],
      );
      if ((r.rowCount ?? 0) === 0) return { granted: false as const, reason: 'cap_reached' as const };
      // Audit row in the SAME transaction: if it fails, the ROLLBACK removes
      // the debit exactly — no best-effort refund, no orphan debit possible.
      await tx.query(
        `INSERT INTO paid_budget_reservations
           (id, day, work_item_id, role, tier, model, amount_usd, state)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, 'reserved')`,
        [id, day, args.workItemId ?? null, args.role ?? null, tierDef.id, args.model ?? tierDef.model, amount],
      );
      return { granted: true as const, reservationId: id, day, amountUsd: amount };
    });
  } catch {
    return { granted: false, reason: 'accounting_unavailable' };
  }
}

/**
 * Reconcile after the provider call: retain actual/estimated cost, release the
 * unused remainder. ONE statement (reservation update + day-row adjust together,
 * guarded on state='reserved') ⇒ idempotent: a finalized reservation can never
 * be double-counted; a racing second call observes rowCount 0 and reports
 * already_finalized with the current state.
 */
/** Map finalizer errors to precise non-success outcomes; null ⇒ treat as accounting_unavailable. */
function finalizeErrorOutcome(err: unknown): FinalizeOutcome | null {
  const msg = String((err as any)?.message ?? '');
  if (msg.startsWith('already_finalized:')) {
    return { ok: false, reason: 'already_finalized', state: msg.slice('already_finalized:'.length) as ReservationState };
  }
  if (msg === 'reservation not found') return { ok: false, reason: 'already_finalized' };
  return null;
}

/**
 * Settle a reservation with retained cost C (0 ≤ C ≤ A):
 *   reserved −A, settled +C, released +max(A−C, 0).
 * Explicit transaction on ONE checked-out client: the reservation state and
 * the day aggregate move together or not at all.
 */
export async function settleReservation(
  db: LedgerDb,
  reservationId: string,
  actualUsd: number,
  costBasis: CostBasis,
): Promise<FinalizeOutcome> {
  const kept = round6(Math.max(0, actualUsd));
  try {
    await finalizeReservationTx(db, reservationId, 'reserved', async (tx, res) => {
      if (kept > res.amountUsd + 1e-9) throw new Error('retained cost exceeds reservation amount');
      const upd = await tx.query(
        `UPDATE paid_budget_reservations
            SET state = 'settled', settled_usd = $2, cost_basis = $3, finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'`,
        [reservationId, kept, costBasis],
      );
      if ((upd.rowCount ?? 0) !== 1) throw new Error('reservation update affected 0 rows');
      const dayUpd = await tx.query(
        `UPDATE paid_budget_days
            SET settled_usd = settled_usd + $2,
                reserved_usd = reserved_usd - $3,
                released_usd = released_usd + GREATEST($3 - $2, 0),
                updated_at = NOW()
          WHERE day = $1::date`,
        [res.day, kept, res.amountUsd],
      );
      if ((dayUpd.rowCount ?? 0) !== 1) throw new Error('day aggregate update affected 0 rows');
    });
    return { ok: true, state: 'settled', countedUsd: kept, costBasis };
  } catch (err) {
    return finalizeErrorOutcome(err) ?? { ok: false, reason: 'accounting_unavailable' };
  }
}

/**
 * Release an unused reservation (no provider call happened, or the call failed
 * before any charge): reserved −A, released +A, settled unchanged.
 * Explicit transaction on ONE checked-out client; idempotency guarded by the
 * reservation row lock and the required source state.
 */
export async function releaseReservation(db: LedgerDb, reservationId: string): Promise<FinalizeOutcome> {
  try {
    await finalizeReservationTx(db, reservationId, 'reserved', async (tx, res) => {
      const upd = await tx.query(
        `UPDATE paid_budget_reservations
            SET state = 'released', finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'`,
        [reservationId],
      );
      if ((upd.rowCount ?? 0) !== 1) throw new Error('reservation update affected 0 rows');
      const dayUpd = await tx.query(
        `UPDATE paid_budget_days
            SET reserved_usd = reserved_usd - $2,
                released_usd = released_usd + $2,
                updated_at = NOW()
          WHERE day = $1::date`,
        [res.day, res.amountUsd],
      );
      if ((dayUpd.rowCount ?? 0) !== 1) throw new Error('day aggregate update affected 0 rows');
    });
    return { ok: true, state: 'released', countedUsd: 0, costBasis: null };
  } catch (err) {
    return finalizeErrorOutcome(err) ?? { ok: false, reason: 'accounting_unavailable' };
  }
}

/**
 * Explicit ambiguity path (timeout/transport uncertainty): RETAIN the reserved
 * amount as counted spend and flag the row for operator reconciliation. The
 * request may have reached the provider and been billed — never undercount.
 * Explicit transaction on ONE checked-out client. Returns the actual retained
 * amount as countedUsd (never a sentinel).
 */
export async function markReconciliationNeeded(db: LedgerDb, reservationId: string): Promise<FinalizeOutcome> {
  try {
    let retained = 0;
    await finalizeReservationTx(db, reservationId, 'reserved', async (tx, res) => {
      const upd = await tx.query(
        `UPDATE paid_budget_reservations
            SET state = 'reconciliation_needed', finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'`,
        [reservationId],
      );
      if ((upd.rowCount ?? 0) !== 1) throw new Error('reservation update affected 0 rows');
      const dayUpd = await tx.query(
        `UPDATE paid_budget_days
            SET settled_usd = settled_usd + $2,
                reserved_usd = reserved_usd - $2,
                updated_at = NOW()
          WHERE day = $1::date`,
        [res.day, res.amountUsd],
      );
      if ((dayUpd.rowCount ?? 0) !== 1) throw new Error('day aggregate update affected 0 rows');
      retained = res.amountUsd;
    });
    return { ok: true, state: 'reconciliation_needed', countedUsd: retained, costBasis: null };
  } catch (err) {
    return finalizeErrorOutcome(err) ?? { ok: false, reason: 'accounting_unavailable' };
  }
}

/**
 * Lazily sweep stale reservations (process died mid-call): after the TTL,
 * RETAIN the reserved amount as counted spend under 'reconciliation_needed' —
 * never silently release money the provider may have billed. Safe to run on
 * every reserve attempt (single indexed statement). Returns the number of day
 * rows adjusted, or -1 when accounting is unavailable.
 */
export async function sweepStaleReservations(db: LedgerDb): Promise<number> {
  try {
    return await withLedgerTx(db, async (tx) => {
      // Row-lock every stale reservation first, then move each day's totals —
      // two phases inside ONE transaction so both sides move together.
      const stale = await tx.query(
        `UPDATE paid_budget_reservations
            SET state = 'reconciliation_needed', finalized_at = NOW()
          WHERE state = 'reserved'
            AND reserved_at < NOW() - ($1 || ' hours')::interval
         RETURNING day::text AS day, amount_usd`,
        [String(reservationTtlHours())],
      );
      if ((stale.rowCount ?? 0) === 0) return 0;
      const byDay = new Map<string, number>();
      for (const row of stale.rows) {
        byDay.set(row.day as string, (byDay.get(row.day as string) ?? 0) + Number(row.amount_usd));
      }
      let touched = 0;
      for (const [day, moved] of byDay) {
        const upd = await tx.query(
          `UPDATE paid_budget_days
              SET settled_usd = settled_usd + $2,
                  reserved_usd = reserved_usd - $2,
                  updated_at = NOW()
            WHERE day = $1::date`,
          [day, round6(moved)],
        );
        if ((upd.rowCount ?? 0) !== 1) throw new Error('day aggregate update affected 0 rows during sweep');
        touched++;
      }
      return touched;
    });
  } catch {
    return -1; // accounting unavailable — callers treat as fail-closed signal
  }
}

/**
 * Operator resolution for sweep-/timeout-flagged rows:
 *  - retain=true  ⇒ reservation becomes 'settled'; day amounts DO NOT change
 *    (the amount was already retained as settled spend when flagged).
 *  - retain=false ⇒ reservation becomes 'released'; day settled −A, released +A.
 * Explicit transaction on ONE checked-out client, guarded on the
 * 'reconciliation_needed' source state.
 */
export async function resolveReconciliation(db: LedgerDb, reservationId: string, retain: boolean): Promise<FinalizeOutcome> {
  try {
    let counted = 0;
    await finalizeReservationTx(db, reservationId, 'reconciliation_needed', async (tx, res) => {
      const upd = await tx.query(
        `UPDATE paid_budget_reservations
            SET state = CASE WHEN $2::boolean THEN 'settled' ELSE 'released' END,
                settled_usd = CASE WHEN $2::boolean THEN amount_usd ELSE NULL END,
                cost_basis = CASE WHEN $2::boolean THEN 'conservative_reservation_estimate' ELSE NULL END,
                finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reconciliation_needed'`,
        [reservationId, retain],
      );
      if ((upd.rowCount ?? 0) !== 1) throw new Error('reservation update affected 0 rows');
      const dayUpd = await tx.query(
        `UPDATE paid_budget_days
            SET settled_usd = settled_usd - CASE WHEN $2::boolean THEN 0 ELSE $3::numeric END,
                released_usd = released_usd + CASE WHEN $2::boolean THEN 0 ELSE $3::numeric END,
                updated_at = NOW()
          WHERE day = $1::date`,
        [res.day, retain, res.amountUsd],
      );
      if ((dayUpd.rowCount ?? 0) !== 1) throw new Error('day aggregate update affected 0 rows');
      counted = retain ? res.amountUsd : 0;
    });
    return { ok: true, state: retain ? 'settled' : 'released', countedUsd: counted, costBasis: retain ? 'conservative_reservation_estimate' : null };
  } catch (err) {
    return finalizeErrorOutcome(err) ?? { ok: false, reason: 'accounting_unavailable' };
  }
}

export type StatusSummary = {
  day: string;
  budgetUsd: number;
  reservedUsd: number;
  settledUsd: number;
  releasedUsd: number;
  remainingUsd: number;
  staleReconciliations: number;
};

export async function summarizeDay(db: LedgerDb, day = utcDay()): Promise<StatusSummary | null> {
  try {
    const d = await db.query(
      `SELECT day::text, budget_usd, reserved_usd, settled_usd, released_usd
         FROM paid_budget_days WHERE day = $1::date`, [day],
    );
    const stale = await db.query(
      `SELECT COUNT(*)::int AS n FROM paid_budget_reservations
        WHERE state = 'reconciliation_needed' AND day = $1::date`, [day],
    );
    const row = d.rows[0];
    const reserved = Number(row?.reserved_usd ?? 0);
    const settled = Number(row?.settled_usd ?? 0);
    const budget = Number(row?.budget_usd ?? 0);
    return {
      day,
      budgetUsd: budget,
      reservedUsd: reserved,
      settledUsd: settled,
      releasedUsd: Number(row?.released_usd ?? 0),
      remainingUsd: Math.max(0, round6(budget - reserved - settled)),
      staleReconciliations: Number(stale.rows[0]?.n ?? 0),
    };
  } catch {
    return null;
  }
}

/** Ladder/accounting state for /api/orchestrator/status (no secrets). */
export type AccountingStatus = 'disabled' | 'free-only' | 'accounting-ready' | 'budget-exhausted' | 'accounting-unavailable';

export async function accountingStatus(
  db: LedgerDb,
  ladderEnabled: boolean,
): Promise<{ status: AccountingStatus; summary: StatusSummary | null }> {
  if (!ladderEnabled) return { status: 'disabled', summary: null };
  if (!await ledgerHealthy(db)) return { status: 'accounting-unavailable', summary: null };
  const summary = await summarizeDay(db);
  if (!summary) return { status: 'accounting-unavailable', summary: null };
  return { status: summary.remainingUsd <= 0 ? 'budget-exhausted' : 'accounting-ready', summary };
}

function cryptoRandomId(): string {
  return randomUUID();
}
