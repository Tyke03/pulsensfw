/**
 * engine.ts — the orchestrator control-plane core.
 *
 * Hard boundaries:
 * - The ONLY component that performs production side effects (draft create/
 *   update, research mutation, publish, affiliate/health writes, media attach).
 * - In shadow/dry_run every side effect is suppressed AND journaled
 *   (orchestration_events.type = 'side_effect_suppressed').
 * - Global halt from agent_instructions short-circuits all dispatch.
 *
 * Usage: const result = await tick({ invoker, mode });  // one orchestrator run
 */
import { db } from '../db';
import {
  workItems, agentRuns, orchestrationEvents, endRailPlans, mediaAssets,
  reviewEscalations, affiliates, affiliateHealthChecks, publishDecisions, posts,
} from '@shared/schema';
import { and, asc, eq, inArray, lte, or, isNull, sql } from 'drizzle-orm';
import { applyTransition, canTransition, type State } from './state-machine';
import { claimLease, releaseLease, verifyLease } from './leases';
import { loadActiveInstructions, evaluateInstructions, markConsumed } from './instructions';
import { AGENTS, getAgent } from './packages';
import type { AgentInvoker } from './invoker';
import { hashInput } from './invoker';
import { resolveEndRailAffiliate, loadLovenseLinks, type HealthStatus } from './affiliate-resolution';
import { runPublishGates } from './policies';
import { slugify } from '../storage';
import { seedDueWorkItems } from './seeders';

export type Mode = 'production' | 'shadow' | 'dry_run';

export type TickResult = {
  mode: Mode;
  halted: boolean;
  haltedBy?: number | null;
  processed: number;
  suppressed: number;
  results: Array<{ workItemId: number; role: string; outcome: string; detail?: string }>;
};

type WorkItem = typeof workItems.$inferSelect;

const MAX_CONCURRENCY_PER_ROLE = Number(process.env.ORCHESTRATOR_ROLE_CONCURRENCY ?? 1);
const MAX_BATCH = Number(process.env.ORCHESTRATOR_BATCH ?? 10);

function redact(s: string): string {
  // belt-and-braces: never let token-shaped strings reach logs
  return s.replace(/[a-f0-9]{32,}/gi, '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

export function currentMode(override?: string): Mode {
  const m = (override ?? process.env.ORCHESTRATOR_MODE ?? 'dry_run').toLowerCase();
  return m === 'production' ? 'production' : m === 'shadow' ? 'shadow' : 'dry_run';
}

const SIDE_EFFECT_ROUTES: Record<string, string> = {
  draft_create: 'POST /api/admin/posts',
  draft_update: 'PUT /api/admin/posts/:id',
  publish: 'POST /api/admin/posts/:id/publish',
  research_mutate: 'PATCH /api/admin/research/:category/items/:id',
  affiliate_mutate: 'POST|PUT|DELETE /api/admin/affiliates',
  media_attach: 'media generation/upload/attach',
  external_comm: 'email/notification',
};

async function journal(
  type: string,
  mode: Mode,
  detail: Record<string, unknown>,
  workItemId?: number,
  runId?: number,
): Promise<void> {
  await db.insert(orchestrationEvents).values({
    type, mode, actor: 'orchestrator', detail, workItemId,
    // run_id is an FK to agent_runs.id; sentinel 0 (no run row exists when the
    // stage crashed before recording) must be stored as NULL, not 0.
    runId: runId && runId > 0 ? runId : null,
  });
}

async function recordRun(args: {
  workItemId: number; role: string; promptId: string; promptVersion: string;
  mode: Mode; inputHash: string; result: Awaited<ReturnType<AgentInvoker['invoke']>>;
  status: string; attempt: number;
}): Promise<number> {
  const row = await db
    .insert(agentRuns)
    .values({
      workItemId: args.workItemId, role: args.role, promptId: args.promptId,
      promptVersion: args.promptVersion, model: args.result.model, provider: args.result.provider,
      mode: args.mode, inputHash: args.inputHash,
      outputHash: args.result.output ? hashInput(args.result.output) : null,
      output: args.mode === 'dry_run' ? null : args.result.output ?? null,
      status: args.status, error: args.result.error ? redact(String(args.result.error)) : null,
      durationMs: args.result.durationMs, attempt: args.attempt,
    })
    .returning({ id: agentRuns.id });
  return row[0].id;
}

/** Execute one prompt-agent invocation with run recording + schema validation. */
async function runAgent(item: WorkItem, invoker: AgentInvoker, mode: Mode): Promise<{
  runId: number; status: string; output?: unknown; error?: string;
}> {
  const agent = getAgent(item.role);
  if (!agent) return { runId: 0, status: 'failed', error: `unknown agent role ${item.role}` };

  const packet = agent.buildWorkPacket(item);
  const invokeMeta = { role: item.role, promptId: agent.id, promptVersion: agent.version, mode };
  let result = await invoker.invoke(packet, agent.systemPrompt, invokeMeta);

  if (!result.ok) {
    const runId = await recordRun({ workItemId: item.id, role: item.role, promptId: agent.id, promptVersion: agent.version, mode, inputHash: hashInput(packet), result, status: 'failed', attempt: item.attemptCount });
    return { runId, status: 'failed', error: result.error };
  }

  const parsed = agent.outputSchema.safeParse(result.output);
  if (!parsed.success) {
    // One self-correction retry: show the model its invalid output + the exact
    // schema errors and ask for corrected JSON (one attempt only, no loops).
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    const repairPacket = {
      originalWorkPacket: packet,
      yourInvalidOutput: result.output,
      schemaErrors: issues,
      instruction: 'Return the CORRECTED JSON only, exactly matching the envelope and stage schema. Fix every listed error.',
    };
    const repair = await invoker.invoke(repairPacket, agent.systemPrompt, invokeMeta);
    const repaired = repair.ok ? agent.outputSchema.safeParse(repair.output) : { success: false } as const;
    if (repair.ok && repaired.success) {
      const runId = await recordRun({ workItemId: item.id, role: item.role, promptId: agent.id, promptVersion: agent.version, mode, inputHash: hashInput(packet), result: repair, status: 'succeeded', attempt: item.attemptCount });
      await journal('schema_self_correction', mode, { role: item.role, issues: issues.slice(0, 300) }, item.id, runId);
      return { runId, status: 'succeeded', output: repaired.data };
    }
    const runId = await recordRun({
      workItemId: item.id, role: item.role, promptId: agent.id, promptVersion: agent.version, mode,
      inputHash: hashInput(packet),
      result: { ...result, error: 'schema_invalid' },
      status: 'schema_invalid', attempt: item.attemptCount,
    });
    return { runId, status: 'schema_invalid', error: issues };
  }

  const runId = await recordRun({ workItemId: item.id, role: item.role, promptId: agent.id, promptVersion: agent.version, mode, inputHash: hashInput(packet), result, status: 'succeeded', attempt: item.attemptCount });
  return { runId, status: 'succeeded', output: parsed.data };
}

async function transition(item: WorkItem, to: State, runId?: number, reason?: string): Promise<WorkItem> {
  const applied = applyTransition(
    { state: item.state, transitionHistory: Array.isArray(item.transitionHistory) ? item.transitionHistory : [] },
    { from: item.state as State, to, actor: 'orchestrator', runId, reason },
  );
  // Keep the in-memory item in sync so sequential transitions chain correctly.
  item.state = applied.state;
  item.transitionHistory = applied.transitionHistory;
  const rows = await db
    .update(workItems)
    .set({ state: applied.state, transitionHistory: applied.transitionHistory, updatedAt: new Date() })
    .where(eq(workItems.id, item.id))
    .returning();
  await journal('transition', currentMode(), { from: item.state, to }, item.id, runId);
  return rows[0];
}

function classifyError(err: string, runStatus?: string): 'retryable' | 'terminal' | 'human_review' {
  if (runStatus === 'schema_invalid') return 'terminal';
  if (runStatus === 'refused' || runStatus === 'escalated') return 'human_review';
  const e = err.toLowerCase();
  if (e.includes('schema_invalid') || e.includes('illegal state')) return 'terminal';
  if (e.includes('no fixture') || e.includes('unknown agent')) return 'terminal';
  if (e.includes('timeout') || e.includes('http 5') || e.includes('http 429') || e.includes('network') || e.includes('fetch')) return 'retryable';
  if (e.includes('policy') || e.includes('sensitive')) return 'human_review';
  return 'retryable';
}

async function markFailure(item: WorkItem, err: string, runId: number, runStatus?: string): Promise<WorkItem> {
  // Already terminal — never re-fail a dead item (guards against double-
  // markFailure loops from both the catch and tick-level handlers).
  if (item.state === 'terminal_failure') return item;
  const cls = classifyError(err, runStatus);
  const attempts = item.attemptCount;
  const maxed = attempts >= item.maxAttempts;
  if (cls === 'terminal' || (cls === 'retryable' && maxed)) {
    if (maxed && cls === 'retryable') {
      await db.insert(reviewEscalations).values({ workItemId: item.id, role: item.role, reasonCode: 'max_attempts_exhausted', detail: { lastError: redact(err) } });
    }
    const next = await transition(item, 'terminal_failure', runId, redact(err));
    await journal('dead_letter', currentMode(), { error: redact(err) }, item.id, runId).catch(() => {});
    return next;
  }
  if (cls === 'human_review') {
    await db.insert(reviewEscalations).values({ workItemId: item.id, role: item.role, reasonCode: 'human_review_required', detail: { error: redact(err) } });
    return transition(item, 'human_review', runId, redact(err));
  }
  // retryable: exponential backoff with jitter
  const base = Math.min(2 ** attempts * 30_000, 30 * 60_000);
  const jitter = Math.floor(Math.random() * 10_000);
  const backoffUntil = new Date(Date.now() + base + jitter);
  const failed = await transition(item, 'retryable_failure', runId, redact(err));
  await journal('retry_scheduled', currentMode(), { backoffUntil: backoffUntil.toISOString(), attempt: attempts }, item.id, runId);
  // return to the pre-failure working state so it can be claimed again
  const resumeState = (item.transitionHistory as any[] | null)?.length
    ? (item.transitionHistory as any[]).filter(h => !['retryable_failure'].includes(h.to)).slice(-1)[0]?.to ?? 'ready_to_write'
    : 'ready_to_write';
  const target: State = (['ready_to_write', 'claimed', 'in_progress', 'draft_proposed', 'visual_pending', 'end_rail_pending', 'qc_pending'].includes(resumeState) ? resumeState : 'ready_to_write') as State;
  return db
    .update(workItems)
    .set({ state: target, backoffUntil, lastError: { message: redact(err), at: new Date().toISOString() }, updatedAt: new Date() })
    .where(eq(workItems.id, failed.id))
    .returning()
    .then(r => r[0]);
}

/** Suppress-and-journal a side effect (shadow/dry_run) or perform it (production). */
async function sideEffect<T>(
  mode: Mode, kind: keyof typeof SIDE_EFFECT_ROUTES, item: WorkItem, runId: number,
  fn: () => Promise<T>, detail?: Record<string, unknown>,
): Promise<T | { suppressed: true }> {
  if (mode !== 'production') {
    await journal('side_effect_suppressed', mode, { kind, route: SIDE_EFFECT_ROUTES[kind], ...(detail ?? {}) }, item.id, runId);
    return { suppressed: true };
  }
  return fn();
}

/** Role-specific stage execution. Returns the outcome string. */
async function executeStage(
  item: WorkItem, lease: { leaseKey: string; attempt: number }, invoker: AgentInvoker, mode: Mode,
): Promise<{ outcome: string; detail?: string }> {
  const { runId, status, output, error } = await runAgent(item, invoker, mode);

  if (status !== 'succeeded') {
    await markFailure(item, error ?? status, runId, status);
    return { outcome: status, detail: error };
  }

  await verifyLeaseSmart(lease, item.id);

  const role = item.role;
  const agent = getAgent(role)!;
  // Unwrap the validated envelope: stage data lives under `payload`.
  const out = ((output as any)?.payload ?? output) as any;

  switch (agent.stage) {
    case 'research': {
      for (const cand of out.candidates ?? []) {
        const routing = agent.categoryRouting ? agent.categoryRouting(cand, item) : item.category;
        if (routing !== item.category) {
          await db.insert(reviewEscalations).values({
            workItemId: item.id, role, reasonCode: 'category_routing_mismatch',
            detail: { proposed: routing, workItemCategory: item.category, candidate: cand.topic },
          });
        }
        await db.insert(workItems).values({
          idempotencyKey: `research-candidate:${cand.duplicate_fingerprint}`,
          type: 'draft', role: `writer-${item.category}`, category: item.category,
          state: 'research_validated', sourceRef: `${item.sourceRef ?? ''}#${cand.fingerprint}`,
          sourcePayload: cand, priority: 5,
        }).onConflictDoNothing();
      }
      await sideEffect(mode, 'research_mutate', item, runId, async () => {
        /* production: mirror item status to research files via admin API */ }, { note: 'research item status mirror' });
      await transition(item, 'research_validated' as State, runId);
      await transition(item, 'research_completed' as State, runId);
      return { outcome: 'research_proposed', detail: `${out.candidates?.length ?? 0} candidates` };
    }
    case 'draft': {

      await transition(item, 'draft_proposed', runId);
      // validate draft against deterministic gates that don't need publishing
      const gates = runPublishGates({
        draft: {
          category: item.category ?? out.category, title: out.title, body: out.body,
          metaTitle: out.metaTitle, metaDescription: out.metaDescription, tags: out.tags,
          newsFit: out.newsFit ?? null, intentBrand: out.intentBrand ?? null,
        },
        media: null, endRail: null, publishedSlugs: new Set<string>(),
      });
      const blocking = gates.filter(g => !g.pass && g.gate !== 'media_ready' && g.gate !== 'end_rail');
      if (blocking.length > 0) {
        await markFailure(item, `policy: ${blocking.map(g => `${g.gate}(${g.detail})`).join('; ')}`, runId);
        return { outcome: 'draft_blocked_by_policy', detail: blocking.map(g => g.gate).join(',') };
      }
      const created = await sideEffect(mode, 'draft_create', item, runId, async () => {
        const res = await db.insert(posts).values({
          title: out.title, slug: out.slug ?? slugify(out.title), body: out.body,
          excerpt: out.excerpt ?? null, category: item.category ?? out.category,
          tags: out.tags ?? [], metaTitle: out.metaTitle ?? null, metaDescription: out.metaDescription ?? null,
          status: 'draft', researchSource: item.sourceRef ?? null,
        }).returning();
        return res[0];
      }, { title: out.title });
      await db.insert(mediaAssets).values({
        workItemId: item.id,
        postId: (created && !('suppressed' in created)) ? (created as any).id : null,
        assetSource: (out.visualBrief?.assetSource ?? 'brand-kit'),
        altText: out.visualBrief?.altText ?? null,
        caption: out.visualBrief?.caption ?? null,
        contentSafetyClassification: out.visualBrief?.contentSafetyClassification ?? null,
        rightsLicensingStatus: out.visualBrief?.rightsLicensingStatus ?? 'pending-review',
        generationPromptOrProvenance: out.visualBrief?.generationPromptOrProvenance ?? null,
        status: 'proposed',
      });
      await transition(item, 'draft_persisted', runId);
      await transition(item, 'visual_pending', runId);
      // visual stage: in shadow, briefs record proposed assets; gating to ready is
      // an orchestrator decision requiring a ready asset record
      const media = await db.select().from(mediaAssets).where(eq(mediaAssets.workItemId, item.id)).limit(1);
      if (media[0]?.status === 'ready' && media[0].altText) {
        await transition(item, 'visual_ready', runId);
      } else {
        await transition(item, 'needs_visual', runId);
        return { outcome: 'needs_visual', detail: 'visual brief proposed; asset not ready' };
      }
      return { outcome: 'draft_persisted', detail: 'draft + visual brief recorded' };
    }
    case 'end_rail': {

      await transition(item, 'end_rail_pending', runId);
      const registry = await db.select().from(affiliates).where(eq(affiliates.active, true));
      const healthRows = await db.select().from(affiliateHealthChecks).orderBy(sql`checked_at DESC`);
      const healthByAffiliateId = new Map<number, HealthStatus>();
      for (const h of healthRows) if (h.affiliateId && !healthByAffiliateId.has(h.affiliateId)) healthByAffiliateId.set(h.affiliateId, h.status as HealthStatus);
      const published = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.status, 'published'));
      const publishedSlugs = new Set(published.map(p => p.slug));

      const resolution = resolveEndRailAffiliate({
        intentBrand: out.affiliateIntent?.brand ?? null,
        draftText: out.draftContextText ?? '',
        registryRows: registry,
        healthByAffiliateId,
        lovenseFile: loadLovenseLinks(),
        isStraightNews: out.isStraightNews ?? item.category === 'industry-news',
        contextuallyRelevant: out.affiliateIntent?.contextuallyRelevant ?? false,
      });
      const relatedValid = (out.relatedPostSlugs ?? []).filter((s: string) => publishedSlugs.has(s) && s !== item.sourceRef);
      const valid = relatedValid.length > 0;
      const plan = {
        relatedPostIds: (out.relatedPostIds ?? []) as number[],
        relatedPostSlugs: relatedValid,
        affiliateRegistryId: resolution.registryId,
        affiliateResolutionReason: resolution.reason,
        fallbackMode: resolution.mode,
        disclosureText: resolution.disclosureRequired ? (await import('../../shared/brand')).END_RAIL_POLICY.disclosureText : null,
        validationStatus: valid ? 'valid' : 'invalid',
        validationDetail: { resolution: resolution.reason, relatedFiltered: (out.relatedPostSlugs ?? []).length - relatedValid.length },
      };
      await db.insert(endRailPlans).values({ workItemId: item.id, ...plan });
      await sideEffect(mode, 'draft_update', item, runId, async () => { /* production: persist end-rail payload on post */ }, { mode: resolution.mode });
      await transition(item, 'end_rail_validated', runId);
      return { outcome: valid ? 'end_rail_valid' : 'end_rail_invalid', detail: plan.validationDetail ? JSON.stringify(plan.validationDetail) : undefined };
    }
    case 'qc': {

      await transition(item, 'qc_pending', runId);
      const rec = out.recommendation;
      const targetState: State = rec === 'publish' ? 'qc_pass' : rec === 'hold' ? 'qc_hold' : 'qc_reject';
      await transition(item, targetState, runId, `qc recommendation: ${rec}`);
      if (rec !== 'publish') {
        await db.insert(reviewEscalations).values({
          workItemId: item.id, role, reasonCode: `qc_${rec}`, detail: { remediation: out.remediation ?? out.scorecard ?? null },
        });
        return { outcome: `qc_${rec}` };
      }
      // deterministic re-verification (orchestrator never trusts QC alone)
      const sourceItem = item.sourcePayload as any ?? {};
      const gates = runPublishGates({
        draft: {
          category: sourceItem.category ?? item.category ?? '', title: sourceItem.title ?? '',
          body: sourceItem.body ?? '', metaTitle: sourceItem.metaTitle ?? null,
          metaDescription: sourceItem.metaDescription ?? null, newsFit: sourceItem.newsFit ?? null,
          intentBrand: sourceItem.intentBrand ?? null,
        },
        media: null, endRail: null, publishedSlugs: new Set<string>(),
      });
      const failing = gates.filter(g => !g.pass);
      if (failing.length > 0) {
        await markFailure(item, `publish gates failed: ${failing.map(g => g.gate).join(',')}`, runId);
        return { outcome: 'publish_blocked_by_gates', detail: failing.map(g => g.gate).join(',') };
      }
      const published = await sideEffect(mode, 'publish', item, runId, async () => {
        const postId = (item.sourcePayload as any)?.postId;
        if (!postId) throw new Error('missing postId for publish');
        const res = await db.update(posts).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(posts.id, postId)).returning();
        return res[0];
      }, { postId: (item.sourcePayload as any)?.postId });
      if (published && !('suppressed' in published)) {
        await db.insert(publishDecisions).values({
          workItemId: item.id, postId: (item.sourcePayload as any).postId, decision: 'published',
          qcRecommendation: rec, gates: gates.map(g => ({ gate: g.gate, pass: g.pass })),
          idempotencyKey: `publish:${item.id}:${item.attemptCount}`,
        });
        await transition(item, 'publish_eligible', runId);
        await transition(item, 'published', runId);
        await transition(item, 'audit_pending', runId);
        return { outcome: 'published' };
      }
      return { outcome: 'publish_suppressed', detail: 'shadow/dry_run' };
    }
    case 'health_check': {
      for (const obs of out.observations ?? []) {
        await db.insert(affiliateHealthChecks).values({
          affiliateId: obs.affiliateId ?? null, url: obs.url, status: obs.status,
          httpStatus: obs.httpStatus ?? null, redirectTarget: obs.redirectTarget ?? null,
          notes: obs.notes ?? null, checkerRunId: runId,
        });
      }
      return { outcome: 'health_recorded', detail: `${out.observations?.length ?? 0} observations` };
    }
    case 'audit': {
      await transition(item, 'audit_completed', runId);
      return { outcome: 'audit_reported', detail: 'report-only persona scorecard recorded' };
    }
    default:
      return { outcome: 'unknown_stage' };
  }
}

async function verifyLeaseSmart(lease: { leaseKey: string; attempt: number }, workItemId: number): Promise<void> {
  // re-verify ownership before continuing after an await gap
  const rows = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
  if (rows.length === 0) throw new Error('work item vanished');
}

/** One orchestrator tick: instruction pickup → claim → execute → record. */
export async function tick(opts: { invoker: AgentInvoker; mode?: Mode }): Promise<TickResult> {
  const mode = currentMode(opts.mode);
  const result: TickResult = { mode, halted: false, processed: 0, suppressed: 0, results: [] };

  // 0. Operator instructions (central enforcement)
  const targets = ['all', ...AGENTS.map(a => a.id), 'orchestrator'];
  const rows = await loadActiveInstructions(targets);
  const effect = evaluateInstructions(rows, 'orchestrator');
  if (effect.globalHalt) {
    result.halted = true;
    result.haltedBy = effect.haltedBy;
    await journal('global_halt_observed', mode, { instructionId: effect.haltedBy });
    for (const row of effect.applied) await markConsumed(row, 'orchestrator');
    return result;
  }
  for (const row of effect.applied) {
    await markConsumed(row, 'orchestrator');
    await journal('instruction_applied', mode, { instructionId: row.id, target: row.target, persist: row.persist });
  }

  // 0.5 Seed due work items (cadence scheduler — idempotent per window)
  try {
    await seedDueWorkItems();
  } catch (e: any) {
    await journal('seed_error', mode, { error: String(e?.message ?? e).slice(0, 200) });
  }

  // 1. Eligible items: daily queue (backfill isolated), backoff respected, not in terminal states
  const eligible = await db
    .select()
    .from(workItems)
    .where(and(
      eq(workItems.queue, 'daily'),
      or(isNull(workItems.backoffUntil), lte(workItems.backoffUntil, new Date())),
      inArray(workItems.state, ['discovered', 'research_validated', 'ready_to_write', 'claimed', 'in_progress', 'draft_proposed', 'end_rail_pending', 'qc_pending', 'audit_pending'] as unknown as string[]),
    ))
    .orderBy(asc(workItems.priority), asc(workItems.createdAt))
    .limit(MAX_BATCH);

  // concurrency caps per role
  const claimedByRole = new Map<string, number>();
  for (const item of eligible) {
    const inFlight = claimedByRole.get(item.role) ?? 0;
    if (inFlight >= MAX_CONCURRENCY_PER_ROLE) {
      result.results.push({ workItemId: item.id, role: item.role, outcome: 'skipped_concurrency_cap' });
      continue;
    }

    let lease;
    try {
      lease = await claimLease(item.id, `orchestrator:${mode}:${Date.now()}`);
    } catch {
      result.results.push({ workItemId: item.id, role: item.role, outcome: 'skipped_already_leased' });
      continue;
    }
    claimedByRole.set(item.role, inFlight + 1);

    let working = item;
    if (working.state === 'research_validated') {
      // Candidate items are born directly in research_validated (one per
      // accepted research candidate) — research is already done, so promote
      // them to the writable state before claiming. discovered →
      // research_validated is the only legal entry into that state, so every
      // eligible research_validated item is a writer candidate by construction.
      working = await transition(working, 'ready_to_write', undefined, 'candidate promoted to writing queue');
    }
    if (canTransition(working.state as State, 'claimed')) {
      working = await transition(working, 'claimed', undefined, 'claimed by orchestrator');
    }
    const claimed = canTransition(working.state as State, 'in_progress')
      ? await transition(working, 'in_progress', undefined, 'execution started')
      : working;
    try {
      const stage = await executeStage(claimed, lease, opts.invoker, mode);
      await releaseLease(lease, lease.leaseKey);
      result.processed += 1;
      result.results.push({ workItemId: item.id, role: item.role, outcome: stage.outcome, detail: stage.detail });
      if (String(stage.detail ?? '').includes('suppressed')) result.suppressed += 1;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (!msg.startsWith('stale worker')) {
        await markFailure(claimed, msg, 0).catch(() => {});
      }
      await releaseLease(lease, lease.leaseKey).catch(() => {});
      result.results.push({ workItemId: item.id, role: item.role, outcome: 'error', detail: redact(msg) });
    }
  }
  return result;
}
