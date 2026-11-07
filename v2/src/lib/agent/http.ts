/**
 * Agent HTTP endpoints (round 2E) — JSON API sharing the exact service layer
 * with the MCP endpoint. Same credentials, same scope enforcement, same
 * idempotency semantics, same audits.
 */
import { AgentError } from './service';

export function agentJson(result: unknown, status = 200): Response {
  return new Response(JSON.stringify(result), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function agentError(error: unknown): Response {
  if (error instanceof AgentError) {
    return agentJson(
      { error: error.code, message: error.message, ...error.extra },
      error.code === 'idempotency-stored' ? 200 : error.httpStatus,
    );
  }
  const message = (error as Error)?.message ?? 'agent request failed';
  return agentJson({ error: 'agent-internal', message }, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AgentError('agent-invalid-input', 400, 'Body must be JSON.');
  }
}

export function getSlugParam(url: URL, name = 'slug'): string {
  const value = (url.searchParams.get(name) ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new AgentError('agent-invalid-input', 400, `Missing or malformed ${name}.`);
  }
  return value;
}

export function idempotentKeyFrom(request: Request, body: unknown): string {
  const headerKey = request.headers.get('idempotency-key');
  const candidates = [headerKey, (body as { idempotencyKey?: unknown })?.idempotencyKey];
  const key = (candidates.find((candidate) => typeof candidate === 'string' && candidate.length >= 8) as string | undefined) ?? '';
  if (!key) {
    throw new AgentError('agent-invalid-input', 400, 'Send an Idempotency-Key header (or idempotencyKey field, 8–128 chars).');
  }
  return key;
}
