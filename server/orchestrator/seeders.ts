/**
 * seeders.ts — cadence-based work-item creation (the scheduler half of the
 * orchestrator). Replaces legacy cron triggers: each tick ensures the right
 * work items exist per role schedule, with per-role cooldowns and idempotency
 * keys so repeated ticks never duplicate work.
 *
 * Legacy cadence mapping (PIPELINE_STATE): research 5x/day per category,
 * writers 2x/day, injector daily, QC daily, health checks daily.
 */
import { db } from '../db';
import { workItems } from '@shared/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

const CATEGORIES = ['ai-chatbots', 'sex-tech', 'vr', 'industry-news', 'how-to', 'rankings'] as const;

/** Minimum seconds between two seeded runs of the same role. */
export const ROLE_COOLDOWN_SEC: Record<string, number> = {
  research: 4 * 60 * 60, // ~5x/day across 6 categories
  draft: 8 * 60 * 60, // 2x/day
  end_rail: 20 * 60 * 60, // daily
  qc: 20 * 60 * 60, // daily
  health_check: 20 * 60 * 60, // daily
  audit: 6 * 24 * 60 * 60, // weekly (persona auditor)
};

async function lastRunAt(role: string): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: workItems.createdAt })
    .from(workItems)
    .where(eq(workItems.role, role))
    .orderBy(sql`created_at DESC`)
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

export type SeededSummary = { role: string; category?: string; idempotencyKey: string }[];

/** Seed due work items; idempotent per (role, windowBucket). */
export async function seedDueWorkItems(now = new Date()): Promise<SeededSummary> {
  const seeded: SeededSummary = [];
  const windowBucket = Math.floor(now.getTime() / (4 * 60 * 60 * 1000)); // 4h buckets

  for (const category of CATEGORIES) {
    // Research: one item per category per 4h window (max ~5-6x/day, mirrors legacy)
    const key = `seed:research-${category}:${windowBucket}`;
    const res = await db
      .insert(workItems)
      .values({ idempotencyKey: key, type: 'research', role: `research-${category}`, category, state: 'discovered' })
      .onConflictDoNothing()
      .returning({ id: workItems.id });
    if (res.length > 0) seeded.push({ role: `research-${category}`, category, idempotencyKey: key });
  }

  // Writer items are born from research candidates (engine research stage),
  // so no direct writer seeding here — the chain drives them.

  // Health check: daily
  const hcKey = `seed:health-check:${Math.floor(now.getTime() / (24 * 60 * 60 * 1000))}`;
  const hc = await db
    .insert(workItems)
    .values({ idempotencyKey: hcKey, type: 'health_check', role: 'affiliate-health-checker', state: 'discovered' })
    .onConflictDoNothing()
    .returning({ id: workItems.id });
  if (hc.length > 0) seeded.push({ role: 'affiliate-health-checker', idempotencyKey: hcKey });

  // QC + end-rail: seeded on demand by the pipeline chain (draft→end_rail→qc),
  // not by cadence — they only make sense when upstream output exists.

  return seeded;
}

/** Ensure follow-on work items exist after a stage completes (chaining). */
export async function seedFollowOn(args: { type: string; role: string; category: string; sourcePayload: unknown }): Promise<string | null> {
  const key = `chain:${args.role}:${Math.floor(Date.now() / (6 * 60 * 60 * 1000))}`;
  const res = await db
    .insert(workItems)
    .values({
      idempotencyKey: key, type: args.type, role: args.role, category: args.category,
      state: 'ready_to_write', sourcePayload: args.sourcePayload as any,
    })
    .onConflictDoNothing()
    .returning({ id: workItems.id });
  return res[0]?.id ? key : null;
}
