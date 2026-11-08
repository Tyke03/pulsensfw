/**
 * Agent service layer (round 2E).
 *
 * The ONLY path to content mutations. Both the MCP endpoint and the HTTP API
 * call exactly these functions, so scope checks, idempotency, concurrency
 * detection, audit and visibility rules cannot drift between transports.
 *
 * Scope matrix (enforced here, not at the wire):
 *   - search_published / read_published / compare_run : any valid key
 *   - upsert_draft / review_draft / affiliate_upsert  : draft scope only
 *   - publish / unpublish / rollback                  : publish scope only
 * Public reads never expose drafts, revisions, or unpublished research.
 *
 * Idempotency semantics:
 *   - every mutation carries a client `idempotencyKey`;
 *   - first call executes and stores its result;
 *   - an identical retry (same key + same canonical request) replays the
 *     stored result — no duplicate revisions;
 *   - the same key with different input (or different credential scope)
 *     fails `idempotency-conflict`;
 *   - an in-flight duplicate conflicts with `retryable: true` — retrying the
 *     identical request after it lands returns the stored result.
 *
 * Mutations audit with the key fingerprint, never the key.
 */
import type { AgentAuth } from './scopes';
import type { Store } from './store';
import type {
  AffiliatatePatch,
  AuditAction,
  DraftRecord,
  DraftState,
  DraftStatus,
  RevisionRecord,
} from './state';
import { requestHashOf } from './canonical';
import { MemoryAgentStore } from './memory-store';
import { SupabaseAgentStore } from './supabase-store';
import type { SearchHit, SearchType } from '../content/types';
import type { Entity, EntityType } from '../content/entity-schema';
import { searchCatalog } from '../content/present';

export type AgentScopeNeeded = 'any' | 'draft' | 'publish';

export class AgentError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly extra: Record<string, unknown>;
  constructor(code: string, httpStatus: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = code;
    this.code = code;
    this.httpStatus = httpStatus;
    this.extra = extra;
  }
}

/** Any available agent store (Supabase, or the dev memory singleton), or null. */
export function tryAgentStore(): Store | null {
  if (SupabaseAgentStore.available()) return new SupabaseAgentStore();
  if (import.meta.env.AGENT_DEV_STORE === 'memory') {
    const g = globalThis as { __pfAgentStore?: Store };
    if (!g.__pfAgentStore) g.__pfAgentStore = new MemoryAgentStore();
    return g.__pfAgentStore;
  }
  return null;
}

export function agentStore(): Store {
  const store = tryAgentStore();
  if (store) return store;
  throw new AgentError('agent-unconfigured', 503, 'Agent store is not configured. Set the Supabase service env (or AGENT_DEV_STORE=memory for local dev).');
}

type ScopeCheck = { ok: true } | { ok: false; code: string; httpStatus: number };

function scopeCheck(auth: AgentAuth | null, needed: AgentScopeNeeded): ScopeCheck {
  if (needed === 'any') {
    return auth ? { ok: true } : { ok: false, code: 'agent-unauthenticated', httpStatus: 401 };
  }
  if (!auth) return { ok: false, code: 'agent-unauthenticated', httpStatus: 401 };
  if (auth.scope !== needed) {
    return { ok: false, code: 'agent-forbidden', httpStatus: 403 };
  }
  return { ok: true };
}

function requireScope(auth: AgentAuth | null, needed: AgentScopeNeeded): void {
  const check = scopeCheck(auth, needed);
  if (!check.ok) {
    const message = !auth
      ? 'This operation needs an agent key.'
      : `This operation needs the ${needed} key.`;
    throw new AgentError(check.code, check.httpStatus, message);
  }
}

/* ---------------- Public reads (site content only, safe reader) ---------------- */

export type PublicRepo = {
  listArticles(): Promise<import('../content/types').RawArticle[]>;
  listCatalog(): Promise<import('../content/types').Catalog>;
  getEntity(type: EntityType, slug: string): Promise<Entity | null>;
  getArticle(slug: string): Promise<import('../content/types').RawArticle | null>;
};

/**
 * Public reader view: SFW-first. Agent-facing reads never expose drafts or
 * unpublished research, and never boost explicit media — a drafts key is not
 * an age verification.
 */
const SAFE_READER = { ageVerified: false, nsfw: false, discreet: false, blur: false, seed: 1 };

export async function agentSearchPublished(
  repo: PublicRepo,
  query: string,
  type: SearchType,
): Promise<SearchHit[]> {
  const [articles, catalog] = await Promise.all([repo.listArticles(), repo.listCatalog()]);
  return searchCatalog(articles, catalog, query, type, SAFE_READER).slice(0, 20);
}

export async function agentReadPublishedArticle(repo: PublicRepo, slug: string): Promise<import('../content/types').RawArticle | null> {
  return repo.getArticle(slug);
}

export async function agentReadPublishedEntity(repo: PublicRepo, kind: string, slug: string): Promise<Entity | null> {
  const types: Record<string, EntityType> = { star: 'star', site: 'site', ai: 'ai_app', product: 'product', game: 'game' };
  const type = types[kind];
  if (!type) throw new AgentError('agent-invalid-input', 400, `Unknown kind: ${kind}`);
  return repo.getEntity(type, slug);
}

/* ---------------- Idempotency runner ---------------- */

async function runIdempotent<T>(
  store: Store,
  op: string,
  auth: AgentAuth | null,
  input: { idempotencyKey: string },
  mutate: () => Promise<T>,
): Promise<T> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) {
    throw new AgentError('agent-invalid-input', 400, 'Provide an idempotency key (8–128 chars). Retries with the same key are safe.');
  }
  const hash = await requestHashOf({ op, input });
  const scope = auth?.scope ?? 'none';
  let claim;
  try {
    claim = await store.claimIdempotency(input.idempotencyKey, hash, scope);
  } catch (error) {
    // Fail closed: a broken claim system must never lead to replicated
    // mutations (the live repro class). Migration 0006 supplies the RPC on
    // Supabase; the dev memory path needs no migration.
    throw new AgentError('agent-store-unavailable', 503, 'Idempotency claim failed; refusing all mutations. Error: ' + String((error as Error)?.message ?? error), { retryable: true });
  }
  if (claim.status === 'stored') {
    return claim.outcome as T;
  }
  if (claim.status === 'conflict-current') {
    throw new AgentError('idempotency-conflict', 409, 'Key already used with different input. Use a fresh key for new work; history keeps the original.');
  }
  if (claim.status === 'conflict-inflight') {
    throw new AgentError('idempotency-inflight', 409, 'Key is in flight. Retry briefly with the identical request to land on the stored result.', { retryable: true });
  }
  const result = await mutate();
  try {
    await store.storeIdempotent(input.idempotencyKey, hash, scope, result);
  } catch (error) {
    throw new AgentError('agent-store-unavailable', 503, 'The operation completed but the idempotency outcome could not be stored; the key is spent for this request. Verify the result server-side before retrying. Error: ' + String((error as Error)?.message ?? error), { retryable: false });
  }
  return result;
}

async function writeAudit(
  store: Store,
  action: AuditAction,
  subject: string,
  auth: AgentAuth | null,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await store.writeAudit(action, subject, auth?.keyPrint ?? 'unknown', detail);
  } catch {
    /* Audit failures never block mutations; the store's own records carry the trail. */
  }
}

/* ---------------- Drafts (draft scope) ---------------- */

export type DraftInput = {
  idempotencyKey: string;
  state: DraftState;
  status: DraftStatus;
  note: string;
  /** Optimistic base: current revisionSeq + its fingerprint. Null only for a new slug. */
  base: { revisionSeq: number; fingerprint: string } | null;
};

export async function upsertDraft(
  store: Store,
  auth: AgentAuth | null,
  input: DraftInput,
): Promise<DraftRecord> {
  requireScope(auth, 'draft');
  const slug = input.state?.slug ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new AgentError('agent-invalid-input', 400, 'Draft state.slug must be a lowercase slug.');
  }
  const problem = validateState(input.state);
  if (problem) throw problem;

  // Idempotency check comes BEFORE concurrency checks: an identical retry on
  // a flaky connection must replay the stored result even when the base has
  // since moved (that is the point of retries).
  const hash = await requestHashOf({ op: 'draft-upsert', input });
  const scope = auth?.scope ?? 'none';
  const claim = await store.claimIdempotency(input.idempotencyKey, hash, scope);
  if (claim.status === 'stored') return claim.outcome as DraftRecord;
  if (claim.status === 'conflict-current') {
    throw new AgentError('idempotency-conflict', 409, 'Key already used with different input. Use a fresh key for new work; history keeps the original.');
  }
  if (claim.status === 'conflict-inflight') {
    throw new AgentError('idempotency-inflight', 409, 'Key is in flight. Retry briefly with the identical request to land on the stored result.', { retryable: true });
  }

  const existing = await store.getDraft(slug);
  if (existing && existing.status === 'published') {
    throw new AgentError('draft-published', 409, 'This draft is published. Unpublish first, then re-edit.');
  }
  if (existing) {
    if (!input.base) {
      throw new AgentError('needs-base', 409, 'Draft exists. Send base {revisionSeq, fingerprint} from your last read so nothing is silently overwritten.', {
        current: { revisionSeq: existing.revisionSeq, fingerprint: existing.fingerprint },
      });
    }
    if (existing.revisionSeq !== input.base.revisionSeq || existing.fingerprint !== input.base.fingerprint) {
      throw new AgentError('stale-revision', 409, 'Draft changed since you read it. Re-fetch and merge; nothing was overwritten.', {
        current: { revisionSeq: existing.revisionSeq, fingerprint: existing.fingerprint },
      });
    }
  } else if (input.base) {
    throw new AgentError('unknown-draft', 404, `Base refers to a draft that does not exist (${slug}).`);
  }

  const snapshot = await upsertDraftOnce(store, auth, input);
  await store.storeIdempotent(input.idempotencyKey, hash, scope, snapshot);
  return snapshot;
}

async function upsertDraftOnce(
  store: Store,
  auth: AgentAuth | null,
  input: DraftInput,
): Promise<DraftRecord> {
  await store.upsertRevision({
    slug: input.state.slug,
    state: input.state,
    status: input.status,
    note: input.note || `Draft updated (${input.status}).`,
    actorPrint: auth?.keyPrint ?? 'unknown',
  });
  await writeAudit(store, 'draft-upsert', input.state.slug, auth, { status: input.status, note: input.note });
  const snapshot = await store.getDraft(input.state.slug);
  if (!snapshot) throw new AgentError('unexpected-loss', 500, 'Draft vanished right after write. Audits keep the trail; retry with the same key.');
  return snapshot;
}

function validateState(state: DraftState): AgentError | null {
  if (state.kind === 'article') {
    if (!state.title?.trim() || !state.dek?.trim()) {
      return new AgentError('agent-invalid-input', 400, 'Article drafts need title and dek.');
    }
    if (!Array.isArray(state.blocks) || state.blocks.length === 0) {
      return new AgentError('agent-invalid-input', 400, 'Article drafts need at least one body block.');
    }
    const cover = state.cover;
    if (!cover || !cover.alt || cover.explicit) {
      return new AgentError('agent-invalid-input', 400, 'Cover must be set and SFW (explicit stills go to images, delivered only after real age verification).');
    }
    if (!cover.license || cover.license === 'example') {
      return new AgentError('agent-invalid-input', 400, 'Cover needs a real license note. "example" marks fixture assets and stays out of agent flow.');
    }
  }
  if (state.kind === 'entity') {
    if (!state.entity?.name?.trim() || state.entity.affiliate_status == null) {
      return new AgentError('agent-invalid-input', 400, 'Entity revisions must carry the full effective entity record.');
    }
  }
  return null;
}

export async function listDraftsFor(store: Store, auth: AgentAuth | null, status: DraftStatus | null): Promise<DraftRecord[]> {
  requireScope(auth, 'draft');
  return store.listDrafts(status);
}

export async function revisionsFor(store: Store, auth: AgentAuth | null, slug: string): Promise<RevisionRecord[]> {
  if (!auth) throw new AgentError('agent-unauthenticated', 401, 'History needs an agent key.');
  return store.listRevisions(slug);
}

/* ---------------- Publication (publish scope) ---------------- */

export type PublishInput = {
  idempotencyKey: string;
  slug: string;
  /** Compare-and-set: the publication version you believe is current. 0 = expect none. */
  expectedVersion: number;
};

export type PublicationResult = { slug: string; status: 'published' | 'unpublished'; version: number };

export async function publishDraft(
  store: Store,
  auth: AgentAuth | null,
  input: PublishInput,
): Promise<PublicationResult> {
  return setPublished(store, auth, input, 'publish', true);
}

export async function unpublishDraft(
  store: Store,
  auth: AgentAuth | null,
  input: PublishInput,
): Promise<PublicationResult> {
  return setPublished(store, auth, input, 'unpublish', false);
}

async function setPublished(
  store: Store,
  auth: AgentAuth | null,
  input: PublishInput,
  action: 'publish' | 'unpublish',
  published: boolean,
): Promise<PublicationResult> {
  requireScope(auth, 'publish');
  const draft = await store.getDraft(input.slug);
  if (!draft) {
    throw new AgentError('unknown-draft', 404, `No draft for slug ${input.slug}.`);
  }
  const note = published ? `Published by QC (publish key) — revision ${draft.revisionSeq}.` : 'Unpublished by QC (publish key).';
  // The claim happens FIRST: a conflicting/failed classification returns
  // 409/503 before ANY mutation — no audit, no revision, no pointer move
  // (the live repro showed a changed-input retry writing a revision). The
  // audit lives inside the claimed mutate, so identical replays write nothing.
  return runIdempotent(store, `publication:${action}`, auth, input, async () => {
    // Publication round = one audited revision, then a compare-and-set
    // pointer to that revision (agent_publications_view joins on it).
    const revision = await store.upsertRevision({
      slug: input.slug,
      state: draft.state,
      status: published ? 'published' : draft.status === 'rolled_back' ? 'rolled_back' : 'in_review',
      note,
      actorPrint: auth?.keyPrint ?? 'unknown',
    });
    try {
      const record = await store.setPublication(
        input.slug,
        published,
        revision.revisionSeq,
        input.expectedVersion > 0 ? input.expectedVersion : null,
      );
      await writeAudit(store, action, input.slug, auth, { note, resultingVersion: record.versionSeq });
      return { slug: record.slug, status: published ? ('published' as const) : ('unpublished' as const), version: record.versionSeq };
    } catch (error) {
      if ((error as Error).message === 'stale-publication') {
        const current = await store.getPublication(input.slug);
        throw new AgentError('stale-publication', 409, 'Publication moved since you read it. Re-fetch and retry with the current version.', {
          current: current ? { version: current.versionSeq, published: current.published } : { version: 0, published: false },
          note: 'The audited revision for this attempt remains in history; the pointer is untouched.',
        });
      }
      throw error;
    }
  });
}

export type RollbackInput = {
  idempotencyKey: string;
  slug: string;
  toSeq: number;
};

export async function rollbackDraft(
  store: Store,
  auth: AgentAuth | null,
  input: RollbackInput,
): Promise<DraftRecord> {
  requireScope(auth, 'publish');
  const history = await store.listRevisions(input.slug);
  const target = history.find((row) => row.seq === input.toSeq);
  if (!target) {
    throw new AgentError('unknown-revision', 404, `No revision ${input.toSeq} for slug ${input.slug}. History is never erased.`);
  }
  return runIdempotent(store, 'rollback', auth, input, async () => {
    // Rollback creates a NEW audited revision that restores the target state;
    // it never erases history. The audit lives inside the claimed mutate.
    await store.upsertRevision({
      slug: input.slug,
      state: target.state,
      status: 'rolled_back',
      note: `Rollback to revision ${target.seq}; pointer unpublished.`,
      actorPrint: auth?.keyPrint ?? 'unknown',
    });
    await writeAudit(store, 'rollback', input.slug, auth, { toSeq: input.toSeq });
    const publication = await store.getPublication(input.slug);
    if (publication?.published) {
      try {
        await store.setPublication(input.slug, false, publication.versionSeq + 1, publication.versionSeq);
      } catch {
        // Pointer move raced; publishing scope re-checks state after.
        throw new AgentError('stale-publication', 409, 'Publication moved during rollback. Fetch the current version and retry the pointer.');
      }
    }
    const record = await store.getDraft(input.slug);
    if (!record) throw new AgentError('unexpected-loss', 500, 'Rollback target vanished. History keeps the trail; retry.');
    return record;
  });
}

/* ---------------- Affiliate metadata queue (draft scope) ---------------- */

export async function affiliateUpsert(
  store: Store,
  auth: AgentAuth | null,
  input: AffiliatatePatch & { idempotencyKey: string },
): Promise<{ slug: string; reference: number; queued: true }> {
  requireScope(auth, 'draft');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    throw new AgentError('agent-invalid-input', 400, 'affiliate patch slug must be a lowercase slug.');
  }
  const result = await runIdempotent(store, 'affiliate-upsert', auth, input, async () => {
    const queued = await store.queueAffiliate(input, auth?.keyPrint ?? 'unknown');
    await writeAudit(store, 'affiliate-upsert', input.slug, auth, { status: input.status, reference: queued });
    return { slug: input.slug, reference: queued, queued: true as const };
  });
  return result;
}

export async function listAffiliateQueue(store: Store, auth: AgentAuth | null): Promise<Array<AffiliatatePatch & { reference: number; at: string }>> {
  requireScope(auth, 'draft');
  return store.listAffiliateQueue();
}
