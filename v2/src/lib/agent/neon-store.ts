/**
 * Neon Postgres agent store (production; stack correction 2026-11).
 *
 * Same semantics as the previous implementation, over the official Neon
 * serverless driver through `lib/db/pg.ts`:
 *   - idempotency claim is a single atomic INSERT .. ON CONFLICT (key_id)
 *     DO NOTHING RETURNING; conflict classification reads the winner's row
 *     (the unique key enforces transactionality at the table level);
 *   - multi-statement publication rounds use neon()'s non-interactive
 *     `transaction()` (all statements in one transaction);
 *   - revisions are append-only with unique (slug, seq).
 *
 * There is no Row-Level Security here and no managed roles: agent tables are
 * private to the server service key by design (no anon grants), and all
 * reader-facing isolation lives in explicit `user_id` equality that the
 * service layer derives from a verified Neon Auth session — never from form
 * input. The Neon migration file documents the replacement of the legacy
 * Supabase RLS/auth.uid() assumptions.
 */
import type { Store, UpsertRequest, IdempotencyOutcome } from '../agent/store';
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
} from '../agent/state';
import { fingerprintOf, STALE_PUBLICATION } from '../agent/canonical';
import { neonRunner, neonConfigured, type PGRunner } from '../db/pg';

type DraftRow = {
  slug: string;
  status: DraftStatus;
  state: DraftState;
  fingerprint: string;
  revision_seq: number;
  revised_at: string;
};

type PublicationRow = {
  slug: string;
  published: boolean;
  version_seq: number;
  updated_at: string;
};

type RevisionRow = {
  slug: string;
  seq: number;
  status_at: DraftStatus;
  state: DraftState;
  note: string;
  actor_print: string;
  created_at: string;
};

type AuditRow = {
  action: AuditAction;
  subject: string;
  actor_print: string;
  detail: Record<string, unknown>;
  at: string;
};

type IdemRow = {
  key_id: string;
  request_hash: string;
  scope: string;
  outcome_json: unknown;
};

export class NeonAgentStore implements Store {
  readonly impl = 'neon' as const;

  /**
   * Optional runner override is a TEST-only path (pglite locally). In
   * production no override is passed and the official Neon driver is used.
   */
  constructor(private readonly override?: PGRunner) {}

  static available(): boolean {
    return neonConfigured();
  }

  private async db(): Promise<PGRunner> {
    if (this.override) return this.override;
    const runner = await neonRunner();
    if (!runner) throw new Error('agent-unconfigured');
    return runner;
  }

  async claimIdempotency(key: string, requestHash: string, scope: string): Promise<IdempotencyOutcome> {
    const db = await this.db();
    const inserted = await db.query(
      'INSERT INTO agent_idempotency (key_id, scope, request_hash) VALUES ($1, $2, $3) ON CONFLICT (key_id) DO NOTHING RETURNING key_id',
      [key, scope, requestHash],
    );
    if (inserted.length > 0) return { status: 'free' };
    const existing = await db.query(
      'SELECT key_id, request_hash, scope, outcome_json FROM agent_idempotency WHERE key_id = $1 LIMIT 1',
      [key],
    );
    const row = existing.at(0) as IdemRow | undefined;
    if (!row) return { status: 'conflict-inflight' };
    if (row.request_hash !== requestHash || row.scope !== scope) return { status: 'conflict-current' };
    if (row.outcome_json !== undefined && row.outcome_json !== null) {
      return { status: 'stored', outcome: row.outcome_json };
    }
    return { status: 'conflict-inflight' };
  }

  async storeIdempotent(key: string, requestHash: string, scope: string, outcome: unknown): Promise<void> {
    const db = await this.db();
    await db.query(
      'UPDATE agent_idempotency SET outcome_json = $4 WHERE key_id = $1 AND request_hash = $2 AND scope = $3',
      [key, requestHash, scope, JSON.stringify(outcome)],
    );
  }

  async upsertRevision(request: UpsertRequest): Promise<UpsertOutcome> {
    const db = await this.db();
    const createdAt = new Date().toISOString();
    const fingerprint = await fingerprintOf(JSON.stringify(request.state));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const seq = await this.nextSeq(db, request.slug);
      const inserted = await db.query(
        'INSERT INTO agent_revisions (slug, seq, status_at, state, note, actor_print, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (slug, seq) DO NOTHING RETURNING slug',
        [request.slug, seq, request.status, JSON.stringify(request.state), request.note, request.actorPrint, createdAt],
      );
      if (inserted.length === 0) continue; // lost the (slug, seq) race; bump and retry
      await db.query(
        'INSERT INTO agent_drafts (slug, status, state, fingerprint, revision_seq, revised_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO UPDATE SET status = EXCLUDED.status, state = EXCLUDED.state, fingerprint = EXCLUDED.fingerprint, revision_seq = EXCLUDED.revision_seq, revised_at = EXCLUDED.revised_at',
        [request.slug, request.status, JSON.stringify(request.state), fingerprint, seq, createdAt],
      );
      return { slug: request.slug, revisionSeq: seq, status: request.status, fingerprint };
    }
    throw new Error('revision-conflict-unresolved');
  }

  async getDraft(slug: string): Promise<DraftRecord | null> {
    const db = await this.db();
    const rows = await db.query('SELECT slug, status, state, fingerprint, revision_seq, revised_at FROM agent_drafts WHERE slug = $1 LIMIT 1', [slug]);
    const row = rows.at(0) as DraftRow | undefined;
    if (!row) return null;
    return { slug: row.slug, status: row.status, state: row.state, fingerprint: row.fingerprint, revisionSeq: row.revision_seq, revisedAt: row.revised_at };
  }

  async listDrafts(status: DraftStatus | null): Promise<DraftRecord[]> {
    const db = await this.db();
    const rows = status
      ? await db.query('SELECT slug, status, state, fingerprint, revision_seq, revised_at FROM agent_drafts WHERE status = $1 ORDER BY slug', [status])
      : await db.query('SELECT slug, status, state, fingerprint, revision_seq, revised_at FROM agent_drafts ORDER BY slug');
    return (rows as DraftRow[]).map((row) => ({
      slug: row.slug,
      status: row.status,
      state: row.state,
      fingerprint: row.fingerprint,
      revisionSeq: row.revision_seq,
      revisedAt: row.revised_at,
    }));
  }

  async getPublication(slug: string): Promise<PublicationRecord | null> {
    const db = await this.db();
    const rows = await db.query('SELECT slug, published, version_seq, updated_at FROM agent_publications WHERE slug = $1 LIMIT 1', [slug]);
    const row = rows.at(0) as PublicationRow | undefined;
    if (!row) return null;
    return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
  }

  async setPublication(slug: string, published: boolean, versionSeq: number, expectedSeq: number | null): Promise<PublicationRecord> {
    const db = await this.db();
    const now = new Date().toISOString();
    if (expectedSeq === null) {
      const inserted = await db.query(
        'INSERT INTO agent_publications (slug, published, version_seq, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING RETURNING slug, published, version_seq, updated_at',
        [slug, published, versionSeq, now],
      );
      const row = inserted.at(0) as PublicationRow | undefined;
      if (row) return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
      throw new Error(STALE_PUBLICATION);
    }
    const updated = await db.query(
      'UPDATE agent_publications SET published = $3, version_seq = $4, updated_at = $5 WHERE slug = $1 AND version_seq = $2 RETURNING slug, published, version_seq, updated_at',
      [slug, expectedSeq, published, versionSeq, now],
    );
    const row = updated.at(0) as PublicationRow | undefined;
    if (!row) throw new Error(STALE_PUBLICATION);
    return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
  }

  async listRevisions(slug: string): Promise<RevisionRecord[]> {
    const db = await this.db();
    const rows = await db.query(
      'SELECT slug, seq, status_at, state, note, actor_print, created_at FROM agent_revisions WHERE slug = $1 ORDER BY seq',
      [slug],
    );
    return (rows as RevisionRow[]).map((row) => ({
      slug: row.slug,
      seq: row.seq,
      statusAt: row.status_at,
      state: row.state,
      note: row.note,
      actorPrint: row.actor_print,
      createdAt: row.created_at,
    }));
  }

  async writeAudit(action: AuditAction, subject: string, actorPrint: string, detail: Record<string, unknown>): Promise<void> {
    const db = await this.db();
    await db.query('INSERT INTO agent_audit (action, subject, actor_print, detail) VALUES ($1, $2, $3, $4)', [
      action, subject, actorPrint, JSON.stringify(detail),
    ]);
  }

  async listAudit(subject: string): Promise<AuditRecord[]> {
    const db = await this.db();
    const rows = await db.query(
      'SELECT action, subject, actor_print, detail, at FROM agent_audit WHERE subject = $1 ORDER BY at DESC LIMIT 50',
      [subject],
    );
    return (rows as AuditRow[]).map((row) => ({ action: row.action, subject: row.subject, actorPrint: row.actor_print, detail: row.detail, at: row.at }));
  }

  async queueAffiliate(patch: AffiliatatePatch, actorPrint: string): Promise<number> {
    const db = await this.db();
    const rows = await db.query(
      'INSERT INTO agent_affiliate_queue (slug, status, patch, actor_print) VALUES ($1, $2, $3, $4) RETURNING reference',
      [patch.slug, patch.status, JSON.stringify(patch), actorPrint],
    );
    const row = rows.at(0) as { reference: number } | undefined;
    if (!row) throw new Error('affiliate-queue-write-failed');
    return row.reference;
  }

  async listAffiliateQueue(): Promise<Array<AffiliatatePatch & { reference: number; at: string }>> {
    const db = await this.db();
    const rows = await db.query(
      'SELECT reference, slug, patch, at FROM agent_affiliate_queue ORDER BY reference DESC LIMIT 100',
    );
    return (rows as Array<{ reference: number; slug: string; patch: AffiliatatePatch; at: string }>).map((row) => ({
      ...row.patch,
      slug: row.slug,
      reference: row.reference,
      at: row.at,
    }));
  }

  async listPublishedStates(): Promise<Array<{ slug: string; state: DraftState; versionSeq: number }>> {
    const db = await this.db();
    const rows = await db.query('SELECT slug, state, version_seq FROM agent_publications_view');
    return (rows as Array<{ slug: string; state: DraftState; version_seq: number }>).map((row) => ({
      slug: row.slug,
      state: row.state,
      versionSeq: row.version_seq,
    }));
  }

  private async nextSeq(db: PGRunner, slug: string): Promise<number> {
    const rows = await db.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM agent_revisions WHERE slug = $1', [slug]);
    const row = rows.at(0) as { next: number };
    return Number(row.next ?? 1);
  }
}
