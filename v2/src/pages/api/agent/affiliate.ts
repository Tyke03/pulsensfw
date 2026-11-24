/**
 * Agent HTTP API — affiliate metadata (round 2E). Draft scope only.
 * POST queues program metadata for the owner affiliate workflow; GET lists
 * the queue. Affiliate status never affects scores or rank anywhere.
 */
import type { APIRoute } from 'astro';
import { agentError, agentJson, readJson } from '../../../lib/agent/http';
import { AgentError, affiliateUpsert, listAffiliateQueue, agentStore } from '../../../lib/agent/service';
import { resolveAgentAuth } from '../../../lib/agent/scopes';

export const prerender = false;

type AffiliateBody = {
  idempotencyKey: string;
  slug: string;
  status: 'active' | 'needs_search' | 'program_found_signup_queued' | 'no_program';
  program_name?: string;
  network?: string;
  commission?: string;
  signup_url?: string;
  commission_days?: number;
  note?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  if (auth.scope !== 'draft') return agentJson({ error: 'agent-forbidden', message: 'Affiliate metadata needs the drafts key.' }, 403);
  try {
    const body = await readJson<AffiliateBody>(request);
    body.idempotencyKey = ((request.headers.get('idempotency-key') ?? body.idempotencyKey) as string) || '';
    return agentJson(await affiliateUpsert(agentStore(), auth, body));
  } catch (error) {
    return agentError(error);
  }
};

export const GET: APIRoute = async ({ request }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  if (auth.scope !== 'draft') return agentJson({ error: 'agent-forbidden' }, 403);
  try {
    return agentJson(await listAffiliateQueue(agentStore(), auth));
  } catch (error) {
    if (error instanceof AgentError && error.httpStatus >= 500) {
      return agentJson({ error: 'agent-unconfigured', message: error.message }, 503);
    }
    return agentError(error);
  }
};
