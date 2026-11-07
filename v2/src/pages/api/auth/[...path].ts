/**
 * Neon Auth catch-all proxy (Managed Better Auth, stack correction 2026-11).
 *
 * Astro routes /api/auth/<path> forward to the managed Better Auth service
 * (NEON_AUTH_BASE_URL) with the reader's own cookie jar; set-cookie headers
 * pass straight back so session rotation stays browser-owned. When the
 * service is not enabled on the Neon project yet, every call answers
 * 503 { error: 'auth-unconfigured' } — the UI keeps its honest guest copy.
 *
 * Contract follows the Managed Better Auth quickstart (Next.js reference
 * implementation does the same proxy inside its SDK; accessed 2026-11-07):
 *   https://neon.com/docs/auth/overview
 *   https://neon.com/docs/auth/quick-start/nextjs-api-only
 */
import type { APIRoute } from 'astro';
import { forwardAuthCall } from '../../../lib/auth/neon';

export const prerender = false;

async function handle(request: Request): Promise<Response> {
  return forwardAuthCall('', request, await request.arrayBuffer());
}

export const POST: APIRoute = ({ request }) => handle(request);
export const GET: APIRoute = ({ request }) => handle(request);
export const PUT: APIRoute = ({ request }) => handle(request);
export const PATCH: APIRoute = ({ request }) => handle(request);
export const DELETE: APIRoute = ({ request }) => handle(request);
