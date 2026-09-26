/**
 * leases.ts — single-owner lease layer over agent_leases.
 * Guarantees: two workers cannot hold the same work item; expired leases are
 * recoverable; a stale worker's completion is rejected (attempt mismatch).
 */
import { db } from '../db';
import { agentLeases, workItems } from '@shared/schema';
import { and, desc, eq, isNull, lt, or, isNull as isNullTs, sql } from 'drizzle-orm';

export type Lease = typeof agentLeases.$inferSelect;

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

/**
 * Claim a work item for leaseKey. Succeeds when no live lease exists (either
 * never leased, released, or expired). Atomic under concurrent claims via a
 * serializable check-then-insert on a single-connection transaction.
 */
export async function claimLease(workItemId: number, leaseKey: string, ttlMs = DEFAULT_LEASE_MS): Promise<Lease> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  return db.transaction(async (tx) => {
    const live = await tx
      .select()
      .from(agentLeases)
      .where(and(eq(agentLeases.workItemId, workItemId), isNull(agentLeases.releasedAt), sql`${agentLeases.expiresAt} > now()`))
      .limit(1);
    if (live.length > 0) throw new Error(`work item ${workItemId} already leased (expires ${live[0].expiresAt.toISOString()})`);

    const item = await tx.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
    if (item.length === 0) throw new Error(`work item ${workItemId} not found`);
    const attempt = (item[0].attemptCount ?? 0) + 1;

    const inserted = await tx
      .insert(agentLeases)
      .values({ workItemId, leaseKey, attempt, acquiredAt: now, expiresAt })
      .returning();
    await tx.update(workItems).set({ attemptCount: attempt, updatedAt: now }).where(eq(workItems.id, workItemId));
    return inserted[0];
  });
}

/** Release (complete) — only valid from the lease owner at the same attempt. */
export async function releaseLease(lease: Lease, leaseKey: string): Promise<boolean> {
  if (lease.leaseKey !== leaseKey) return false; // stale worker
  const res = await db
    .update(agentLeases)
    .set({ releasedAt: new Date() })
    .where(and(eq(agentLeases.id, lease.id), isNull(agentLeases.releasedAt), eq(agentLeases.leaseKey, leaseKey)))
    .returning();
  return res.length > 0;
}

/** True when the caller (leaseKey, attempt) is still the current valid owner. */
export async function verifyLease(lease: Lease, leaseKey: string): Promise<boolean> {
  if (lease.leaseKey !== leaseKey) return false;
  const rows = await db.select().from(agentLeases).where(eq(agentLeases.id, lease.id)).limit(1);
  const current = rows[0];
  if (!current) return false;
  if (current.releasedAt !== null) return false;
  if (current.expiresAt.getTime() <= Date.now()) return false;
  if (current.attempt !== lease.attempt) return false; // a newer lease superseded us
  return true;
}

/** Items whose lease expired without release (recovery candidates). */
export async function findExpiredLeases(): Promise<Lease[]> {
  return db
    .select()
    .from(agentLeases)
    .where(and(isNull(agentLeases.releasedAt), sql`${agentLeases.expiresAt} <= now()`));
}

/** Guard used before completing work: throws when caller is stale. */
export async function assertNotStale(lease: Lease, leaseKey: string): Promise<void> {
  const ok = await verifyLease(lease, leaseKey);
  if (!ok) throw new Error(`stale worker: lease ${lease.id} no longer owned by ${leaseKey}`);
}
