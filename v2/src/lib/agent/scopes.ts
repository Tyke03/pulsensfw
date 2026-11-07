/**
 * External-agent access control (round 2E).
 *
 * Two independent server-side credentials, resolved from env:
 *   AGENT_DRAFT_KEY   — research, drafts, affiliate metadata. Cannot publish.
 *   AGENT_PUBLISH_KEY — publish, unpublish, rollback. Cannot draft.
 * Scope is enforced on every operation in the service layer (the single seam
 * used by both the MCP endpoint and the HTTP API). Keys never reach browser
 * code, URLs, or logs — audits record a key fingerprint only.
 */
const encoder = new TextEncoder();

export type AgentScope = 'draft' | 'publish';

export type AgentAuth = {
  scope: AgentScope;
  /** Stable fingerprint for audit rows. Not reversible to the key. */
  keyPrint: string;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
function sameSecret(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) {
    // Still touch every byte to flatten timing; the check stays a failure.
    for (let i = 0; i < left.length; i += 1) void (left[i] ^ left[i]);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function trimKey(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function agentKeysConfigured(): boolean {
  const draft = trimKey(import.meta.env.AGENT_DRAFT_KEY).length > 0;
  const publish = trimKey(import.meta.env.AGENT_PUBLISH_KEY).length > 0;
  return draft || publish;
}

/** Resolve a bearer token to a scope, or null. Never reveals the key. */
export async function resolveAgentAuth(bearer: string | null): Promise<AgentAuth | null> {
  const token = (bearer ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const draftKey = trimKey(import.meta.env.AGENT_DRAFT_KEY);
  const publishKey = trimKey(import.meta.env.AGENT_PUBLISH_KEY);
  if (draftKey && sameSecret(token, draftKey)) {
    return { scope: 'draft', keyPrint: (await sha256Hex(draftKey)).slice(0, 12) };
  }
  if (publishKey && sameSecret(token, publishKey)) {
    return { scope: 'publish', keyPrint: (await sha256Hex(publishKey)).slice(0, 12) };
  }
  return null;
}

/** Challenges that never leak expected-key material. */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'agent-unauthenticated' }), {
    status: 401,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'www-authenticate': 'Bearer',
      'mcp-protocol-version': '2025-06-18',
      'cache-control': 'no-store',
    },
  });
}
