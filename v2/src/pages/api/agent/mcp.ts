/**
 * MCP endpoint (round 2E): stateless Streamable HTTP over the official SDK
 * (`@modelcontextprotocol/sdk` WebStandardStreamableHTTPServerTransport).
 *
 * Per request:
 *   1. bearer → AgentAuth (401 + WWW-Authenticate per the MCP auth spec);
 *   2. agent store resolved (503 honest unavailable when nothing configured);
 *   3. a fresh McpServer is built for this credential scope, so tools outside
 *      the scope are not even listed;
 *   4. `transport.handleRequest` answers the POST (application/json, since
 *      enableJsonResponse is set);
 *   5. GET/DELETE/PUT/PATCH → 405 method-not-allowed with a JSON-RPC body per
 *      the transport spec for servers that offer no SSE stream.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp';
import { getContentRepository } from '../../../lib/content/local-repository';
import { buildMcpServer, type McpContext } from '../../../lib/mcp/server';
import { agentStore } from '../../../lib/agent/service';
import type { PublicRepo } from '../../../lib/agent/service';
import { agentJson } from '../../../lib/agent/http';
import { resolveAgentAuth, unauthorized } from '../../../lib/agent/scopes';
import type { EntityType } from '../../../lib/content/entity-schema';

export const prerender = false;

const agentRepo: PublicRepo = {
  listArticles: () => getContentRepository().listArticles(),
  getArticle: (slug: string) => getContentRepository().getArticle(slug),
  listCatalog: () => getContentRepository().listCatalog(),
  getEntity: (type: EntityType, slug: string) => getContentRepository().getEntity(type, slug),
};

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this stateless server accepts POSTs only.' } }),
    { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', 'mcp-protocol-version': '2025-06-18', allow: 'POST' } },
  );
}

export const POST: import('astro').APIRoute = async ({ request }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return unauthorized();
  let store;
  try {
    store = agentStore();
  } catch (error) {
    return agentUnavailable(error);
  }
  return handlerStateless(request, { auth, repo: agentRepo, store });
};

async function handlerStateless(request: Request, ctx: McpContext): Promise<Response> {
  if (request.headers.get('content-type') && !/application\/json/i.test(request.headers.get('content-type') ?? '')) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Unsupported Media Type: Content-Type must be application/json' } }),
      { status: 415, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless per request
    enableJsonResponse: true,
  });
  try {
    const server = buildMcpServer(ctx);
    await server.server.connect(transport);
    const response = await transport.handleRequest(request);
    await server.server.close().catch(() => undefined);
    return response;
  } catch (error) {
    await transport.close().catch(() => undefined);
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: (error as Error).message ?? 'transport failed' } }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}

function agentUnavailable(error: unknown): Response {
  void error;
  return agentJson(
    { error: 'agent-unconfigured', message: 'Agent store is not configured. Set the Supabase service env (or AGENT_DEV_STORE=memory for local dev).' },
    503,
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
