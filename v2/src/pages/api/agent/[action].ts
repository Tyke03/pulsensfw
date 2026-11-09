/**
 * Agent HTTP API — publication (round 2E). Publish scope only:
 * POST /api/agent/publish | unpublish | rollback share this module and the
 * service layer with MCP. All mutations are idempotent.
 */
import type { APIRoute } from 'astro';
import { agentError, agentJson, readJson } from '../../../lib/agent/http';
import { agentStore, publishDraft, rollbackDraft, unpublishDraft } from '../../../lib/agent/service';
import { resolveAgentAuth } from '../../../lib/agent/scopes';

export const prerender = false;

type PublishBody = { idempotencyKey: string; slug: string; expectedVersion: number };
type RollbackBody = { idempotencyKey: string; slug: string; toSeq: number };

async function withPublishScope<T>(request: Request, run: () => Promise<T>): Promise<Response> {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  if (auth.scope !== 'publish') return agentJson({ error: 'agent-forbidden', message: 'Publication needs the publish key.' }, 403);
  try {
    return agentJson(await run());
  } catch (error) {
    return agentError(error);
  }
}

export const POST: APIRoute = async ({ request, url, params }) => {
  const action = (params.action ?? '').toLowerCase();
  if (action === 'publish' || action === 'unpublish') {
    return withPublishScope(request, async () => {
      const body = await readJson<PublishBody>(request);
      body.idempotencyKey = ((request.headers.get('idempotency-key') ?? body.idempotencyKey) as string) || '';
      const outcome = action === 'publish'
        ? await publishDraft(agentStore(), await resolveAgentAuth(request.headers.get('authorization')), body)
        : await unpublishDraft(agentStore(), await resolveAgentAuth(request.headers.get('authorization')), body);
      return outcome;
    });
  }
  if (action === 'rollback') {
    return withPublishScope(request, async () => {
      const body = await readJson<RollbackBody>(request);
      body.idempotencyKey = ((request.headers.get('idempotency-key') ?? body.idempotencyKey) as string) || '';
      return rollbackDraft(agentStore(), await resolveAgentAuth(request.headers.get('authorization')), body);
    });
  }
  void url;
  return agentJson({ error: 'agent-invalid-input', message: 'Unknown publication action.' }, 404);
};
