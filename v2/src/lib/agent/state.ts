/**
 * Agent content state (round 2E).
 *
 * One draft = one content record with append-only revisions in Supabase.
 * Article drafts store a block list (renderable at runtime by
 * components/templates/BlocksBody.astro); entity drafts store the full
 * effective entity JSON for the revision (no silent merges at publish).
 * Formats stay JSON — no MDX compile happens in the Worker runtime.
 */
import type { Kind, TopicId, RawImage, ArticleSource } from '../content/types';
import type { Entity } from '../content/entity-schema';

export const BLOCK_TYPES = ['p', 'h2', 'h3', 'ul', 'quote'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type BodyBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'quote'; text: string };

export type DraftArticleState = {
  kind: 'article';
  slug: string;
  title: string;
  dek: string;
  topic: TopicId;
  kind2: Kind;
  author: string;
  kicker: string;
  tags: string[];
  entities: string[];
  cover: RawImage;
  images: RawImage[];
  sources: ArticleSource[];
  checkedAt: string | null;
  blocks: BodyBlock[];
};

export type DraftEntityState = {
  kind: 'entity';
  slug: string;
  /** Full effective entity for this revision — never a partial overwrite. */
  entity: Entity;
};

export type DraftState = DraftArticleState | DraftEntityState;

export type DraftStatus = 'draft' | 'in_review' | 'published' | 'rolled_back';

export type DraftRecord = {
  slug: string;
  status: DraftStatus;
  revisionSeq: number;
  revisedAt: string;
  state: DraftState;
  /** sha256 of canonical(state) — a revision token for optimistic concurrency. */
  fingerprint: string;
};

export type RevisionRecord = {
  slug: string;
  seq: number;
  statusAt: DraftStatus;
  state: DraftState;
  note: string;
  actorPrint: string;
  createdAt: string;
};

export type PublicationRecord = {
  slug: string;
  published: boolean;
  versionSeq: number;
  updatedAt: string;
};

export type AuditAction = 'draft-upsert' | 'publish' | 'unpublish' | 'rollback' | 'affiliate-upsert';

export type AuditRecord = {
  action: AuditAction;
  subject: string;
  actorPrint: string;
  detail: Record<string, unknown>;
  at: string;
};

export type UpsertOutcome = { slug: string; revisionSeq: number; status: DraftStatus; fingerprint: string };

export type AffiliatatePatch = {
  slug: string;
  status: 'active' | 'needs_search' | 'program_found_signup_queued' | 'no_program';
  program_name?: string;
  network?: string;
  commission?: string;
  signup_url?: string;
  commission_days?: number;
  note?: string;
};
