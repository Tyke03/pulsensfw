/**
 * Agent store seam (round 2E).
 *
 * Implementations: neon-store.ts (production, Neon Postgres) and memory.ts
 * (unit tests + explicit AGENT_DEV_STORE=memory dev mode, never production).
 * The store owns transactional idempotency, append-only revisions, publication
 * state and the audit trail. It never guesses scope — the service checks it.
 */
import type {
  AffiliatatePatch,
  AuditAction,
  AuditRecord,
  DraftRecord,
  DraftState,
  DraftStatus,
  PublicationRecord,
  RevisionRecord,
  UpsertOutcome,
} from './state';

export type IdempotencyOutcome =
  | { status: 'free' }
  | { status: 'stored'; outcome: unknown }
  | { status: 'conflict-current' }
  | { status: 'conflict-inflight' };

export type UpsertRequest = {
  slug: string;
  state: DraftState;
  status: DraftStatus;
  note: string;
  actorPrint: string;
};

export type Store = {
  readonly impl: 'neon' | 'memory';

  /* Idempotency (transactional unique key at the store). */
  claimIdempotency(key: string, requestHash: string, scope: string): Promise<IdempotencyOutcome>;
  storeIdempotent(key: string, requestHash: string, scope: string, outcome: unknown): Promise<void>;

  /* Drafts + revisions (append-only; unique (slug, seq)). */
  upsertRevision(request: UpsertRequest): Promise<UpsertOutcome>;
  getDraft(slug: string): Promise<DraftRecord | null>;
  listDrafts(status: DraftStatus | null): Promise<DraftRecord[]>;

  /* Publication (visible content pointer with version for compare-and-set). */
  getPublication(slug: string): Promise<PublicationRecord | null>;
  setPublication(slug: string, published: boolean, versionSeq: number, expectedSeq: number | null): Promise<PublicationRecord>;

  /* History. */
  listRevisions(slug: string): Promise<RevisionRecord[]>;

  /* Audit (append-only). */
  writeAudit(action: AuditAction, subject: string, actorPrint: string, detail: Record<string, unknown>): Promise<void>;
  listAudit(subject: string): Promise<AuditRecord[]>;

  /* Affiliate metadata queue (draft-scope writers; owner workflow consumes). */
  queueAffiliate(patch: AffiliatatePatch, actorPrint: string): Promise<number>;
  listAffiliateQueue(): Promise<Array<AffiliatatePatch & { reference: number; at: string }>>;

  /* Published content reads for the hybrid repository. */
  listPublishedStates(): Promise<Array<{ slug: string; state: DraftState; versionSeq: number }>>;
};

export class StoreUnavailableError extends Error {
  constructor() {
    super('agent store is not configured');
    this.name = 'StoreUnavailable';
  }
}
