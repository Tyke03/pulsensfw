/**
 * Later phases add an MCP endpoint and an HTTP API on this same content seam.
 * Local agents submit drafts with a drafts-only key. A QC agent publishes with
 * a separate publish key. Neither key is ever sent to the browser.
 * Phase 1 does not implement these ports and does not expose an admin route.
 */
export type DraftInput = {
  slug: string;
  title: string;
  dek: string;
  topic: string;
  body: string;
};

export interface DraftSubmissionPort {
  submitDraft(draft: DraftInput, auth: { keyScope: 'drafts' }): Promise<{ id: string; status: 'draft' }>;
}

export interface PublishPort {
  publish(id: string, auth: { keyScope: 'publish' }): Promise<{ status: 'published' }>;
}

export interface ContentRepositoryInfo {
  /** Active backend. Phase 1 is always the local seed. */
  source: 'local-seed';
}
