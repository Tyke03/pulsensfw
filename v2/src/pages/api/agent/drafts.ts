/**
 * Agent HTTP API — drafts (round 2E).
 *
 * Same service layer as the MCP tools. Draft scope only; every mutation
 * carries an idempotency key (header `Idempotency-Key` or body field).
 */
import type { APIRoute } from 'astro';
import { agentError, agentJson, readJson } from '../../../lib/agent/http';
import { listDraftsFor, upsertDraft, AgentError, type DraftInput } from '../../../lib/agent/service';
import { resolveAgentAuth } from '../../../lib/agent/scopes';
import { agentStore } from '../../../lib/agent/service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  if (auth.scope !== 'draft') return agentJson({ error: 'agent-forbidden', message: 'Drafts need the drafts key.' }, 403);
  let body: DraftInput;
  try {
    body = await readJson<DraftInput>(request);
    body.idempotencyKey = ((request.headers.get('idempotency-key') ?? body.idempotencyKey) as string) || '';
  } catch (error) {
    return agentError(error);
  }
  try {
    return agentJson(await upsertDraft(agentStore(), auth, body));
  } catch (error) {
    return agentError(error);
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  if (auth.scope !== 'draft') return agentJson({ error: 'agent-forbidden', message: 'Drafts need the drafts key.' }, 403);
  try {
    const slug = url.searchParams.get('slug');
    const status = url.searchParams.get('status');
    if (slug) {
      const drafts = await listDraftsFor(agentStore(), auth, null);
      const match = drafts.find((draft) => draft.slug === slug);
      if (!match) return agentJson({ error: 'unknown-draft' }, 404);
      return agentJson(match);
    }
    const allowed = new Set(['draft', 'in_review', 'published', 'rolled_back']);
    return agentJson(await listDraftsFor(agentStore(), auth, status ? (allowed.has(status) ? (status as 'draft') : null) : null));
  } catch (error) {
    if (error instanceof AgentError && error.httpStatus >= 500) {
      return agentJson({ error: 'agent-unconfigured', message: error.message }, 503);
    }
    return agentError(error);
  }
};
