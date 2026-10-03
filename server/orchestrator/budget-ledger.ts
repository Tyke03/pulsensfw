/**
 * budget-ledger.ts — durable, atomic daily budget ledger for paid-model calls.
 *
 * Enforces the daily paid-spend cap via Postgres row-level RESERVATIONS rather
 * than read-then-write aggregates. Every mutation is a SINGLE guarded SQL
 * statement (CTE form), so it is atomic without explicit transactions: the
 * day-row debit and the reservation row are written together or not at all,
 * and the guard `budget_usd - reserved_usd - settled_usd >= amount` serializes
 * concurrent callers on the day row lock (READ COMMITTED re-check). Overlapping
 * orchestrator ticks can never collectively exceed POLLINATIONS_DAILY_BUDGET_USD.
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
 *
 * Every ledger transaction is also TIME-BOUNDED: pool acquisition uses
 * LEDGER_DB_CONNECTION_TIMEOUT_MS, and lock_timeout / statement_timeout are set
 * on the checked-out client immediately after BEGIN, so a lock wait or slow
 * ledger query aborts (and rolls back, releasing the client) instead of hanging
 * an orchestrator tick indefinitely. No ledger transaction is ever held open
 * across an external model-provider HTTP call — the invoker reserves, then
 * calls the provider, then finalizes; the three phases never overlap a tx.
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
 * statements share a connection and transaction. Time bounds (lock_timeout /
 * statement_timeout) are applied transaction-locally by withLedgerTx.
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
 *
 * PRODUCTION SAFETY: the db surface MUST expose connect() (a pg Pool does).
 * A query-only surface cannot open a transaction, so multi-row atomicity
 * (reservation row + day aggregate moving together) cannot be guaranteed on
 * it — running ledger writes there anyway would silently degrade the ledger's
 * core invariant. Instead of the old non-transactional test-double fallback
 * (`return fn(db)`), a missing connect() throws
 * 'ledger_db_not_transaction_capable', which every ledger caller maps to
 * accounting_unavailable → paid escalation refused (free-only), fail-closed.
 */
export async function withLedgerTx<T>(
  db: LedgerDb,
  fn: (tx: LedgerTx) => Promise<T>,
): Promise<T> {
  const provider = db as Partial<LedgerClientProvider>;
  if (typeof provider.connect !== 'function') {
    // Wiring failure: refuse rather than run multi-row mutations without a
    // transaction. Fail-closed via the accounting_unavailable mapping below.
    throw new Error('ledger_db_not_transaction_capable');
  }
  // Acquisition is bounded by the pool's connectionTimeoutMillis: a saturated
  // pool fails FAST here instead of queueing an orchestrator tick indefinitely.
  // The rejection propagates to callers, which map it to
  // accounting_unavailable (fail-closed: paid refused, free runs).
  const client = await provider.connect();
  try {
    await client.query('BEGIN');
    // Bound the transaction server-side: lock waits and slow statements abort
    // with a query error instead of hanging the tick while holding row locks.
    // SET LOCAL is transaction-scoped — the bounds lapse at COMMIT/ROLLBACK and
    // never leak onto the pooled connection. Valid on Neon (Postgres 14+) and
    // local Postgres alike; plain integers (ms) need no quoting.
    await client.query(`SET LOCAL lock_timeout = ${ledgerLockTimeoutMs()}`);
    await client.query(`SET LOCAL statement_timeout = ${ledgerStatementTimeoutMs()}`);
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

// ── Ledger pool configuration (env-backed, conservative defaults) ────────────
// The ledger is a LOW-VOLUME, latency-sensitive dependency: a handful of short
// transactions per orchestrator tick. Defaults below fit the current Render
// plan and stay far under practical Neon connection limits (roughly 1/3 of a
// direct ~100-connection limit and ~1/10 of a pooler endpoint's). Raise
// LEDGER_DB_POOL_MAX only with headroom math: concurrent ledger clients can
// never exceed it, and every one of them also needs a slot in Neon's limits.
export const LEDGER_DB_POOL_MAX_DEFAULT = 3;
export const LEDGER_DB_CONNECTION_TIMEOUT_MS_DEFAULT = 5_000;
export const LEDGER_DB_IDLE_TIMEOUT_MS_DEFAULT = 30_000;
export const LEDGER_DB_LOCK_TIMEOUT_MS_DEFAULT = 4_000;
export const LEDGER_DB_STATEMENT_TIMEOUT_MS_DEFAULT = 5_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const v = Number(process.env[name]);
  if (!Number.isFinite(v) || v < min || v > max) return fallback;
  return Math.floor(v);
}

/** Max pool clients. 1..20; invalid/absent ⇒ conservative 3. */
export function ledgerPoolMax(): number {
  return envInt('LEDGER_DB_POOL_MAX', LEDGER_DB_POOL_MAX_DEFAULT, 1, 20);
}
/** Pool acquisition timeout (ms) — pool.connect() fails fast past this. */
export function ledgerConnectionTimeoutMs(): number {
  return envInt('LEDGER_DB_CONNECTION_TIMEOUT_MS', LEDGER_DB_CONNECTION_TIMEOUT_MS_DEFAULT, 100, 60_000);
}
/** Idle client reap timeout (ms) — releases Neon slots when ticks are sparse. */
export function ledgerIdleTimeoutMs(): number {
  return envInt('LEDGER_DB_IDLE_TIMEOUT_MS', LEDGER_DB_IDLE_TIMEOUT_MS_DEFAULT, 1_000, 600_000);
}
/** Per-statement server-side abort (ms) — covers slow ledger queries. */
export function ledgerStatementTimeoutMs(): number {
  return envInt('LEDGER_DB_STATEMENT_TIMEOUT_MS', LEDGER_DB_STATEMENT_TIMEOUT_MS_DEFAULT, 100, 60_000);
}
/** Row-lock wait bound (ms) — a contended FOR UPDATE aborts instead of hanging. */
export function ledgerLockTimeoutMs(): number {
  return envInt('LEDGER_DB_LOCK_TIMEOUT_MS', LEDGER_DB_LOCK_TIMEOUT_MS_DEFAULT, 100, 60_000);
}
/**
 * Optional client-side query watchdog (pg `query_timeout`). Disabled by
 * default: the server-side statement_timeout already bounds slow queries, and
 * a duplicated kill-path adds a rare class of double-error handling. Set
 * LEDGER_DB_QUERY_TIMEOUT_MS to arm it.
 */
export function ledgerQueryTimeoutMs(): number | null {
  return envInt('LEDGER_DB_QUERY_TIMEOUT_MS', 0, 0, 60_000) || null;
}

let singleton: LedgerDb | null = null;
/**
 * True when the db surface exposes a checked-out client provider (pg
 * Pool-like). The ledger's multi-row mutations REQUIRE this surface; anything
 * else is a wiring failure and must fail closed.
 */
export function isTransactionCapableLedgerDb(db: LedgerDb): boolean {
  return typeof (db as Partial<LedgerClientProvider>).connect === 'function';
}
/**
 * Module-singleton ledger pool built from DATABASE_URL (same SSL rules as
 * db.ts). NEVER log connectionString or any credential material from here —
 * the pool's own error events are intentionally not forwarded with DSNs.
 */
export function getLedgerDb(): LedgerDb {
  if (singleton) return singleton;
  const isLocal = /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: ledgerPoolMax(),
    connectionTimeoutMillis: ledgerConnectionTimeoutMs(),
    idleTimeoutMillis: ledgerIdleTimeoutMs(),
    // Server-side net-level watchdog; armed only when explicitly configured.
    ...(ledgerQueryTimeoutMs() ? { query_timeout: ledgerQueryTimeoutMs()! } : {}),
    // Close connections that sit idle inside a transaction (dead-process bug
    // guard). Absent from the env ⇒ server default (unbounded) is kept.
    ...(Number(process.env.LEDGER_DB_IDLE_TX_TIMEOUT_MS) > 0
      ? { idle_in_transaction_session_timeout: Number(process.env.LEDGER_DB_IDLE_TX_TIMEOUT_MS) }
      : {}),
    // Env vars are cheap; DSNs and passwords never are. Nothing in this object
    // is ever logged or exposed via the status endpoint.
    application_name: 'pulsensfw-budget-ledger',
  } as import('pg').PoolConfig);
  // Swallow idle-client error events so a Neon-side drop during an idle gap
  // cannot crash the process (errors for CHECKED-OUT clients still surface to
  // their awaiters, and acquisition failures surface through connect()).
  pool.on('error', () => { /* idle client dropped by server; logged nowhere (no secrets) */ });
  // Production-safety assertion: the ledger db MUST be transaction-capable
  // (expose connect()). Today's pg Pool always is; this guards a future
  // refactor that swaps Pool for a query-only wrapper. On violation, fail
  // CLOSED: return a permanently-failing, non-connectable db so every ledger
  // path maps to accounting_unavailable and paid escalation is refused.
  if (!isTransactionCapableLedgerDb(pool)) {
    return (singleton = {
      query: async () => { throw new Error('ledger_db_not_transaction_capable'); },
    });
  }
  singleton = pool;
  return singleton;
}

/** Minimal read-only LedgerDb for tests/doubles without a pg Pool. Multi-row
 *  ledger mutations on it are refused (no connect() ⇒ no transaction). */
export function makeLedgerDbFromQuery(query: LedgerDb['query']): LedgerDb {
  return { query };
}

/**
 * SAFE, non-secret pool health for /api/orchestrator/status. Numbers only:
 * total/idle/waiting client counts and the configured bounds. No DSN, host,
 * user, database name, tokens, or SQL text ever enters this object.
 * Non-pg surfaces (or a not-yet-created pool) report nulls.
 */
export function ledgerPoolHealth(db: LedgerDb = getLedgerDb()): {
  totalClients: number | null; idleClients: number | null; waitingClients: number | null;
  poolMax: number; connectionTimeoutMs: number; idleTimeoutMs: number;
  lockTimeoutMs: number; statementTimeoutMs: number;
} {
  const pool = db as unknown as {
    totalCount?: unknown; idleCount?: unknown; waitingCount?: unknown;
    options?: { connectionTimeoutMillis?: unknown; idleTimeoutMillis?: unknown };
  };
  const intOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
  return {
    totalClients: intOrNull(pool.totalCount),
    idleClients: intOrNull(pool.idleCount),
    waitingClients: intOrNull(pool.waitingCount),
    poolMax: ledgerPoolMax(),
    connectionTimeoutMs: ledgerConnectionTimeoutMs(),
    idleTimeoutMs: ledgerIdleTimeoutMs(),    lockTimeoutMs: ledgerLockTimeoutMs(),
    statementTimeoutMs: ledgerStatementTimeoutMs(),
  };
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
  const v = Number(process.env.POLLINATIONS_RESERVE_MARGIN);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0;
}

/** Sweeper releases/retains stale reservations after this many hours. */
export function reservationTtlHours(): number {
  const v = Number(process.env.POLLINATIONS_RESERVATION_TTL_HOURS);
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
  // Wiring failure (query-only surface): report accounting unavailable instead
  // of silently ready — the ledger's explicit transactions could never run.
  if (!isTransactionCapableLedgerDb(db)) return { status: 'accounting-unavailable', summary: null };
  if (!await ledgerHealthy(db)) return { status: 'accounting-unavailable', summary: null };
  const summary = await summarizeDay(db);
  if (!summary) return { status: 'accounting-unavailable', summary: null };
  return { status: summary.remainingUsd <= 0 ? 'budget-exhausted' : 'accounting-ready', summary };
}

function cryptoRandomId(): string {
  return randomUUID();
}
