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
 * Cost basis semantics (recorded per reservation):
 *  - 'provider_reported_actual' — usage from the provider response converted
 *    at configured rates; reconciles (replaces) the reservation.
 *  - 'conservative_estimate'    — maximum plausible exposure (reservation
 *    input assumption + tier max_tokens); used when usage is unavailable.
 * agent_runs.cost_usd records actual-or-conservative-estimated cost; the
 * operator contract lives in docs/RUNTIME.md.
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Tier } from './model-ladder';
import { tierFor, estimateCostUsd, dailyBudgetUsd, utcDay } from './model-ladder';

export type { CostBasis } from './model-ladder';

/** Narrow DB surface; satisfied by a pg Pool (or the drizzle client's pool). */
export interface LedgerDb {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
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
  | { ok: true; state: 'settled' | 'released' | 'reconciliation_needed'; countedUsd: number; costBasis: 'provider_reported_actual' | 'conservative_estimate' | null }
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
    const r = await db.query(
      `INSERT INTO paid_budget_days (day, budget_usd, reserved_usd)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (day) DO UPDATE
         SET reserved_usd = paid_budget_days.reserved_usd + $3,
             updated_at = NOW()
       WHERE paid_budget_days.budget_usd - paid_budget_days.reserved_usd - paid_budget_days.settled_usd >= $3
       RETURNING day::text AS day, reserved_usd`,
      [day, dailyBudgetUsd(), amount],
    );
    if ((r.rowCount ?? 0) === 0) return { granted: false, reason: 'cap_reached' };
    try {
      await db.query(
        `INSERT INTO paid_budget_reservations
           (id, day, work_item_id, role, tier, model, amount_usd, state)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, 'reserved')`,
        [id, day, args.workItemId ?? null, args.role ?? null, tierDef.id, args.model ?? tierDef.model, amount],
      );
    } catch {
      // Audit row failed: refund our own debit (best effort) and fail closed.
      await db.query(
        `UPDATE paid_budget_days
            SET reserved_usd = reserved_usd - $2, updated_at = NOW()
          WHERE day = $1::date`,
        [day, amount],
      ).catch(() => {});
      return { granted: false, reason: 'accounting_unavailable' };
    }
    return { granted: true, reservationId: id, day, amountUsd: amount };
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
export async function settleReservation(
  db: LedgerDb,
  reservationId: string,
  actualUsd: number,
  costBasis: 'provider_reported_actual' | 'conservative_estimate',
): Promise<FinalizeOutcome> {
  const kept = round6(Math.max(0, actualUsd));
  try {
    const r = await db.query(
      `WITH target AS (
         UPDATE paid_budget_reservations
            SET state = 'settled', settled_usd = $2, cost_basis = $3, finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'
         RETURNING day, amount_usd
       ), day_upd AS (
         UPDATE paid_budget_days d
            SET settled_usd = d.settled_usd + $2,
                reserved_usd = d.reserved_usd - t.amount_usd,
                released_usd = d.released_usd + GREATEST(t.amount_usd - $2, 0),
                updated_at = NOW()
           FROM target t
          WHERE d.day = t.day
         RETURNING d.day
       )
       SELECT day::text AS day FROM day_upd`,
      [reservationId, kept, costBasis],
    );
    if ((r.rowCount ?? 0) === 0) {
      const cur = await db.query(`SELECT state FROM paid_budget_reservations WHERE id = $1::uuid`, [reservationId]);
      return { ok: false, reason: 'already_finalized', state: cur.rows[0]?.state };
    }
    return { ok: true, state: 'settled', countedUsd: kept, costBasis };
  } catch {
    return { ok: false, reason: 'accounting_unavailable' };
  }
}

/**
 * Release an unused reservation (no provider call happened, or the call failed
 * before any charge). ONE statement, same idempotency guard as settle.
 */
export async function releaseReservation(db: LedgerDb, reservationId: string): Promise<FinalizeOutcome> {
  try {
    const r = await db.query(
      `WITH target AS (
         UPDATE paid_budget_reservations
            SET state = 'released', finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'
         RETURNING day, amount_usd
       ), day_upd AS (
         UPDATE paid_budget_days d
            SET reserved_usd = d.reserved_usd - t.amount_usd,
                released_usd = d.released_usd + t.amount_usd,
                updated_at = NOW()
           FROM target t
          WHERE d.day = t.day
         RETURNING d.day
       )
       SELECT day::text AS day FROM day_upd`,
      [reservationId],
    );
    if ((r.rowCount ?? 0) === 0) {
      const cur = await db.query(`SELECT state FROM paid_budget_reservations WHERE id = $1::uuid`, [reservationId]);
      return { ok: false, reason: 'already_finalized', state: cur.rows[0]?.state };
    }
    return { ok: true, state: 'released', countedUsd: 0, costBasis: null };
  } catch {
    return { ok: false, reason: 'accounting_unavailable' };
  }
}

/**
/**
 * Explicit ambiguity path (timeout/transport uncertainty): RETAIN the reserved
 * amount as counted spend and flag the row for operator reconciliation. The
 * request may have reached the provider and been billed — never undercount.
 * ONE statement, guarded on state='reserved' (idempotent).
 */
export async function markReconciliationNeeded(db: LedgerDb, reservationId: string): Promise<FinalizeOutcome> {
  try {
    const r = await db.query(
      `WITH target AS (
         UPDATE paid_budget_reservations
            SET state = 'reconciliation_needed', finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reserved'
         RETURNING day, amount_usd
       ), day_upd AS (
         UPDATE paid_budget_days d
            SET settled_usd = d.settled_usd + t.amount_usd,
                reserved_usd = reserved_usd - t.amount_usd,
                updated_at = NOW()
           FROM target t
          WHERE d.day = t.day
         RETURNING d.day
       )
       SELECT day::text AS day FROM day_upd`,
      [reservationId],
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, reason: 'already_finalized' };
    return { ok: true, state: 'reconciliation_needed', countedUsd: -1, costBasis: 'conservative_estimate' };
  } catch {
    return { ok: false, reason: 'accounting_unavailable' };
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
    const r = await db.query(
      `WITH stale AS (
         UPDATE paid_budget_reservations r
            SET state = 'reconciliation_needed', finalized_at = NOW()
           WHERE state = 'reserved'
             AND reserved_at < NOW() - ($1 || ' hours')::interval
         RETURNING r.day, r.amount_usd
       ), totals AS (
         SELECT day, SUM(amount_usd) AS moved FROM stale GROUP BY day
       )
       UPDATE paid_budget_days d
          SET settled_usd = d.settled_usd + t.moved,
              reserved_usd = d.reserved_usd - t.moved,
              updated_at = NOW()
         FROM totals t WHERE d.day = t.day
       RETURNING d.day`,
      [String(reservationTtlHours())],
    );
    return r.rowCount ?? 0;
  } catch {
    return -1; // accounting unavailable — callers treat as fail-closed signal
  }
}

/**
 * Operator resolution for sweep-retained rows: keep the retained conservative
 * spend, or return it if investigation proved the provider never charged.
 * The sweep already moved reserved→settled on the day row, so: retain ⇒ no
 * day-row change; refund ⇒ settled→released. ONE statement, guarded.
 */
export async function resolveReconciliation(db: LedgerDb, reservationId: string, retain: boolean): Promise<FinalizeOutcome> {
  try {
    const r = await db.query(      `WITH target AS (
         UPDATE paid_budget_reservations
            SET state = CASE WHEN $2 THEN 'settled' ELSE 'released' END,
                settled_usd = CASE WHEN $2 THEN amount_usd ELSE NULL END,
                cost_basis = CASE WHEN $2 THEN 'conservative_estimate' ELSE NULL END,
                finalized_at = NOW()
          WHERE id = $1::uuid AND state = 'reconciliation_needed'
         RETURNING day, amount_usd
       ), day_upd AS (
         UPDATE paid_budget_days d
            SET settled_usd = d.settled_usd - CASE WHEN $2 THEN 0 ELSE t.amount_usd END,
                released_usd = d.released_usd + CASE WHEN $2 THEN 0 ELSE t.amount_usd END,
                updated_at = NOW()
           FROM target t
          WHERE d.day = t.day
         RETURNING d.day, t.amount_usd AS amount_usd
       )
       SELECT day::text AS day, amount_usd FROM day_upd`,
    [reservationId, retain],
    );
    if ((r.rowCount ?? 0) === 0) return { ok: false, reason: 'already_finalized' };
    const row = r.rows[0];
    return { ok: true, state: retain ? 'settled' : 'released', countedUsd: retain ? Number(row.amount_usd) : 0, costBasis: retain ? 'conservative_estimate' : null };
  } catch {
    return { ok: false, reason: 'accounting_unavailable' };
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
