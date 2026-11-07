/**
 * In-memory agent store (round 2E).
 *
 * Used by unit tests and, only when `AGENT_DEV_STORE=memory` is set, by local
 * dev — never production: drafts and publications here vanish with the
 * isolate, and production content belongs in Neon Postgres. Semantics mirror
 * the Neon store: transactional idempotency (unique key), append-only
 * revisions with unique (slug, seq), compare-and-set publication, audit
 * trail, affiliate queue.
 */
import { fingerprintOf, STALE_PUBLICATION } from './canonical';
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
import type { IdempotencyOutcome, Store, UpsertRequest } from './store';

export async function fingerprintOfState(state: DraftState): Promise<string> {
  return fingerprintOf(JSON.stringify(state));
}

type MemoryRow = {
  key: string;
  requestHash: string;
  scope: string;
  outcome: unknown;
};


export class MemoryAgentStore implements Store {
  readonly impl = 'memory' as const;
  private rows = new Map<string, MemoryRow>();
  private revisions = new Map<string, RevisionRecord[]>();
  private drafts = new Map<string, DraftRecord>();
  private publications = new Map<string, PublicationRecord>();
  private audit: AuditRecord[] = [];
  private affiliate: Array<AffiliatatePatch & { reference: number; at: string; actor_print: string }> = [];

  async claimIdempotency(key: string, requestHash: string, scope: string): Promise<IdempotencyOutcome> {
    const row = this.rows.get(`${scope}:${key}`);
    if (row) {
      if (row.requestHash !== requestHash) return { status: 'conflict-current' };
      if (row.outcome !== undefined) return { status: 'stored', outcome: row.outcome };
      return { status: 'conflict-inflight' };
    }
    this.rows.set(`${scope}:${key}`, { key, requestHash, scope, outcome: undefined });
    return { status: 'free' };
  }

  async storeIdempotent(key: string, requestHash: string, scope: string, outcome: unknown): Promise<void> {
    const row = this.rows.get(`${scope}:${key}`);
    if (!row) throw new Error('claim first');
    if (row.requestHash !== requestHash) return;
    row.outcome = outcome;
  }

  async upsertRevision(request: UpsertRequest): Promise<UpsertOutcome> {
    const list = this.revisions.get(request.slug) ?? [];
    const seq = list.length + 1;
    const createdAt = new Date().toISOString();
    list.push({
      slug: request.slug,
      seq,
      statusAt: request.status,
      state: request.state,
      note: request.note,
      actorPrint: request.actorPrint,
      createdAt,
    });
    this.revisions.set(request.slug, list);
    const outcome: UpsertOutcome = {
      slug: request.slug,
      revisionSeq: seq,
      status: request.status,
      fingerprint: await fingerprintOfState(request.state),
    };
    this.drafts.set(request.slug, {
      slug: request.slug,
      status: request.status,
      revisionSeq: seq,
      revisedAt: createdAt,
      state: request.state,
      fingerprint: outcome.fingerprint,
    });
    return outcome;
  }

  async getDraft(slug: string): Promise<DraftRecord | null> {
    return this.drafts.get(slug) ?? null;
  }

  async listDrafts(status: DraftStatus | null): Promise<DraftRecord[]> {
    const rows = [...this.drafts.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    return status ? rows.filter((row) => row.status === status) : rows;
  }

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    return this.publications.get(slug) ?? null;
  }

  async setPublication(slug: string, published: boolean, versionSeq: number, expectedSeq: number | null): Promise<PublicationRecord> {
    const current = this.publications.get(slug) ?? null;
    // Compare-and-set: expected null means "must not exist yet"; an existing
    // pointer with a higher version rejects the flip.
    if (expectedSeq === null && current) throw new Error(STALE_PUBLICATION);
    if (expectedSeq !== null && (!current || current.versionSeq !== expectedSeq)) {
      throw new Error(STALE_PUBLICATION);
    }
    if (current && published === current.published && current.versionSeq >= versionSeq) {
      return current; // No-op stays honest: same state, same version.
    }
    const record: PublicationRecord = { slug, published, versionSeq, updatedAt: new Date().toISOString() };
    this.publications.set(slug, record);
    return record;
  }

  async listRevisions(slug: string): Promise<RevisionRecord[]> {
    return [...(this.revisions.get(slug) ?? [])].sort((a, b) => a.seq - b.seq);
  }

  async writeAudit(action: AuditAction, subject: string, actorPrint: string, detail: Record<string, unknown>): Promise<void> {
    this.audit.push({ action, subject, actorPrint, detail, at: new Date().toISOString() });
  }

  async listAudit(subject: string): Promise<AuditRecord[]> {
    return this.audit.filter((row) => row.subject === subject).reverse();
  }

  async queueAffiliate(patch: AffiliatatePatch, actorPrint: string): Promise<number> {
    const reference = this.affiliate.length + 1;
    this.affiliate.push({ ...patch, reference, at: new Date().toISOString(), actor_print: actorPrint });
    return reference;
  }

  async listAffiliateQueue(): Promise<Array<AffiliatatePatch & { reference: number; at: string }>> {
    return this.affiliate.map(({ actor_print: _actor, ...rest }) => {
      void _actor;
      return rest;
    });
  }

  async listPublishedStates(): Promise<Array<{ slug: string; state: DraftState; versionSeq: number }>> {
    const rows: Array<{ slug: string; state: DraftState; versionSeq: number }> = [];
    for (const publication of this.publications.values()) {
      if (!publication.published) continue;
      const draft = this.drafts.get(publication.slug);
      if (!draft) continue;
      rows.push({ slug: publication.slug, state: draft.state, versionSeq: publication.versionSeq });
    }
    return rows;
  }
}

export { STALE_PUBLICATION };
