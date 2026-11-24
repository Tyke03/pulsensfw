/**
 * Agent publishing seam (round 2E). Types only — implementations live in
 * lib/agent/ (service + stores) and routes under pages/api/agent/.
 *
 * Two independent server-side credentials; scope is enforced per operation:
 *   AGENT_DRAFT_KEY   — research, drafts, affiliate metadata (never publishes).
 *   AGENT_PUBLISH_KEY — publish / unpublish / rollback (never drafts).
 * Keys stay server-side; audits record a key fingerprint, never the key.
 */
export type DraftInput = {
  slug: string;
  title: string;
  dek: string;
  topic: string;
  body: string;
};

export type AgentScopeName = 'draft' | 'publish';

export interface ContentRepositoryInfo {
  /** Active backend: local seeded fixtures, or local seed + agent store overlay. */
  source: 'local-seed' | 'local-seed+agent-store';
}

export interface DraftSubmissionPort {
  submitDraft(draft: DraftInput, auth: { keyScope: AgentScopeName }): Promise<{ id: string; status: 'draft' }>;
}

export interface PublishPort {
  publish(id: string, auth: { keyScope: 'publish' }): Promise<{ status: 'published' }>;
}
