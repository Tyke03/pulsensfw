/**
 * Supabase agent store (round 2E, production).
 *
 * Service-role writes only; RLS carries no anon policies on these tables
 * (migration 0002_agent_content.sql), so the only path is through this module,
 * and every write is scoped by the caller's verified key print at the service
 * layer — never by anything from the wire.
 *
 * Idempotency is transactional: the claim row has a unique key; the insert is
 * `on conflict do nothing` + re-read. Identical retries read the stored
 * outcome; a reused key with a different payload (or different credential
 * scope) conflicts; a concurrent in-flight request conflicts with
 * `retryable: true` so clients can retry and land on the stored outcome.
 *
 * Revisions are append-only with a unique (slug, seq). Publication is a
 * compare-and-set pointer (`version_seq` exactly-matched update).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, supabaseConfigured } from '../auth/supabase';
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
import { fingerprintOf, STALE_PUBLICATION } from './canonical';

type DraftRow = {
  slug: string;
  status: DraftStatus;
  state: DraftState;
  fingerprint: string;
  revision_seq: number;
  revised_at: string;
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

type PublicationRow = {
  slug: string;
  published: boolean;
  version_seq: number;
  updated_at: string;
};

type AuditRow = {
  action: AuditAction;
  subject: string;
  actor_print: string;
  detail: Record<string, unknown>;
  at: string;
};

export class SupabaseAgentStore implements Store {
  readonly impl = 'supabase' as const;

  static available(): boolean {
    return supabaseConfigured() && Boolean(import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private db(): SupabaseClient {
    if (!SupabaseAgentStore.available()) throw new Error('agent-unconfigured');
    return supabaseAdmin();
  }

  async claimIdempotency(key: string, requestHash: string, scope: string): Promise<IdempotencyOutcome> {
    // Single SQL statement (0006): INSERT .. ON CONFLICT DO NOTHING for a
    // fresh key, or classify the winner row — the stored request_hash can
    // never be rewritten by this path, so changed-input retries cannot
    // reclassify themselves (the live bug reviewed in the repro).
    const { data, error } = await this.db().rpc('agent_claim_idempotency', {
      p_key: key,
      p_scope: scope,
      p_hash: requestHash,
    });
    if (error) throw error;
    const row = ((data ?? []) as Array<{ claim_status?: string; outcome?: unknown }>).at(0);
    if (!row?.claim_status) return { status: 'conflict-inflight' };
    if (row.claim_status === 'free') return { status: 'free' };
    if (row.claim_status === 'stored') return { status: 'stored', outcome: row.outcome };
    if (row.claim_status === 'conflict-current') return { status: 'conflict-current' };
    return { status: 'conflict-inflight' };
  }

  async storeIdempotent(key: string, requestHash: string, scope: string, outcome: unknown): Promise<void> {
    const { error } = await this.db().rpc('agent_store_idempotent_outcome', {
      p_key: key,
      p_scope: scope,
      p_hash: requestHash,
      p_outcome: outcome as never,
    });
    if (error) throw error;
  }

  async upsertRevision(request: UpsertRequest): Promise<UpsertOutcome> {
    const createdAt = new Date().toISOString();
    // Walk to a free seq: unique (slug, seq) makes concurrent writers retry
    // instead of duplicating a revision.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const seq = await this.nextSeq(request.slug);
      const revision: RevisionRow = {
        slug: request.slug,
        seq,
        status_at: request.status,
        state: request.state,
        note: request.note,
        actor_print: request.actorPrint,
        created_at: createdAt,
      };
      const insert = await this.db().from('agent_revisions').insert(revision);
      if (insert.error) {
        if (isUniqueViolation(insert.error)) continue;
        throw insert.error;
      }
      const fingerprint = await fingerprintOf(JSON.stringify(request.state));
      const draft: DraftRow = {
        slug: request.slug,
        status: request.status,
        state: request.state,
        fingerprint,
        revision_seq: seq,
        revised_at: createdAt,
      };
      const upsert = await this.db().from('agent_drafts').upsert(draft, { onConflict: 'slug' });
      if (upsert.error) throw upsert.error;
      return { slug: request.slug, revisionSeq: seq, status: request.status, fingerprint };
    }
    throw new Error('revision-conflict-unresolved');
  }

  async getDraft(slug: string): Promise<DraftRecord | null> {
    const read = await this.db()
      .from('agent_drafts')
      .select('slug, status, state, fingerprint, revised_at, revision_seq')
      .eq('slug', slug)
      .limit(1);
    const row = ((read.data ?? []) as DraftRow[]).at(0);
    if (!row) return null;
    return {
      slug: row.slug,
      status: row.status,
      state: row.state,
      fingerprint: row.fingerprint,
      revisionSeq: row.revision_seq,
      revisedAt: row.revised_at,
    };
  }

  async listDrafts(status: DraftStatus | null): Promise<DraftRecord[]> {
    let query = this.db().from('agent_drafts').select('slug, status, state, fingerprint, revised_at, revision_seq');
    if (status) query = query.eq('status', status);
    const rows = (await query).data ?? [];
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
    const read = await this.db()
      .from('agent_publications')
      .select('slug, published, version_seq, updated_at')
      .eq('slug', slug)
      .limit(1);
    const row = ((read.data ?? []) as PublicationRow[]).at(0);
    if (!row) return null;
    return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
  }

  async setPublication(
    slug: string,
    published: boolean,
    versionSeq: number,
    expectedSeq: number | null,
  ): Promise<PublicationRecord> {
    if (expectedSeq === null) {
      // First publication for this slug: insert-if-absent, conflict otherwise.
      const insert = await this.db()
        .from('agent_publications')
        .upsert(
          { slug, published, version_seq: versionSeq, updated_at: new Date().toISOString() },
          { onConflict: 'slug', ignoreDuplicates: true },
        )
        .select('slug, published, version_seq, updated_at');
      const row = ((insert.data ?? []) as PublicationRow[]).at(0);
      if (row) return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
      throw new Error(STALE_PUBLICATION);
    }
    const update = await this.db()
      .from('agent_publications')
      .update({ published, version_seq: versionSeq, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .eq('version_seq', expectedSeq)
      .select('slug, published, version_seq, updated_at');
    const row = ((update.data ?? []) as PublicationRow[]).at(0);
    if (!row) throw new Error(STALE_PUBLICATION);
    return { slug: row.slug, published: row.published, versionSeq: row.version_seq, updatedAt: row.updated_at };
  }

  async listRevisions(slug: string): Promise<RevisionRecord[]> {
    const rows = (await this.db()
      .from('agent_revisions')
      .select('slug, seq, status_at, state, note, actor_print, created_at')
      .eq('slug', slug)
      .order('seq')).data ?? [];
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
    const res = await this.db().from('agent_audit').insert({ action, subject, actor_print: actorPrint, detail });
    if (res.error) throw res.error;
  }

  async listAudit(subject: string): Promise<AuditRecord[]> {
    const rows = (await this.db()
      .from('agent_audit')
      .select('action, subject, actor_print, detail, at')
      .eq('subject', subject)
      .order('at', { ascending: false })
      .limit(50)).data ?? [];
    return (rows as AuditRow[]).map((row) => ({
      action: row.action,
      subject: row.subject,
      actorPrint: row.actor_print,
      detail: row.detail,
      at: row.at,
    }));
  }

  async listPublishedStates(): Promise<Array<{ slug: string; state: DraftState; versionSeq: number }>> {
    const rows = (await this.db().from('agent_publications_view').select('slug, state, version_seq')).data ?? [];
    return (rows as Array<{ slug: string; state: DraftState; version_seq: number }>).map((row) => ({
      slug: row.slug,
      state: row.state,
      versionSeq: row.version_seq,
    }));
  }

  async queueAffiliate(patch: AffiliatatePatch, actorPrint: string): Promise<number> {
    const insert = await this.db()
      .from('agent_affiliate_queue')
      .insert({ slug: patch.slug, status: patch.status, patch, actor_print: actorPrint })
      .select('reference');
    const row = ((insert.data ?? []) as Array<{ reference: number }>).at(0);
    if (!row || insert.error) throw insert.error ?? new Error('affiliate-queue-write-failed');
    return row.reference;
  }

  async listAffiliateQueue(): Promise<Array<AffiliatatePatch & { reference: number; at: string }>> {
    const rows = (await this.db()
      .from('agent_affiliate_queue')
      .select('reference, slug, patch, at')
      .order('reference', { ascending: false })
      .limit(100)).data ?? [];
    return (rows as Array<{ reference: number; slug: string; patch: AffiliatatePatch; at: string }>).map((row) => ({
      ...row.patch,
      slug: row.slug,
      reference: row.reference,
      at: row.at,
    }));
  }

  private async nextSeq(slug: string): Promise<number> {
    const read = await this.db()
      .from('agent_revisions')
      .select('seq')
      .eq('slug', slug)
      .order('seq', { ascending: false })
      .limit(1);
    const rows = (read.data ?? []) as Array<{ seq: number }>;
    return (rows.at(0)?.seq ?? 0) + 1;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && 'code' in (error as Record<string, unknown>) &&
    (error as { code: string }).code === '23505';
}
