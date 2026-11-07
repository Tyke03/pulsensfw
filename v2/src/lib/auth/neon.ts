/**
 * Neon Auth (Managed Better Auth) server integration for Astro SSR.
 *
 * Status: implemented but HONESTLY UNCONFIGURED until the Neon project's
 * Better Auth service is enabled (owner action in the Neon Console). The
 * integration uses the documented service contract of Neon's managed
 * Better Auth: the service answers Better Auth API requests at
 * NEON_AUTH_BASE_URL, sessions are resolved server-side via /get-session,
 * and cookies carry the session. Docs (accessed 2026-11-07):
 *   https://neon.com/docs/auth/overview
 *   https://neon.com/docs/auth/quick-start/nextjs-api-only
 *   (the upstream contract mirrors Better Auth's handler/session API — the
 *   official Next.js SDK does the same proxying; there is no Next.js here,
 *   so the Astro route proxies to the managed service directly).
 *
 * Rules enforced here:
 *   - user identity ALWAYS comes from a server-side /get-session call using
 *     the reader's own cookie headers; client-supplied user ids are never
 *     trusted;
 *   - service-side isolation replaces the legacy Supabase RLS/auth.uid()
 *     pattern (every reader statement filters by the verified user_id; see
 *     lib/reader/store.ts and the Neon migration header);
 *   - when unconfigured everything answers the honest 503/notice states and
 *     the UI keeps the guest copy.
 */
import type { SessionRow } from './session-types';

const MANAGED_SESSION_PATH = '/get-session';
const SIGN_IN_PATH = '/sign-in/email';
const SIGN_UP_PATH = '/sign-up/email';
const SIGN_OUT_PATH = '/sign-out';

function env(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

export function neonAuthConfigured(): boolean {
  const base = (env().NEON_AUTH_BASE_URL ?? '').trim();
  const secret = (env().NEON_AUTH_COOKIE_SECRET ?? '').trim();
  const result = base.startsWith('https://') && secret.length >= 32;
  return result;
}

/** Testable variant: same rules with an explicit env dictionary. */
export function neonAuthConfiguredWith(envOverride: Record<string, string | undefined>): boolean {
  const base = (envOverride.NEON_AUTH_BASE_URL ?? '').trim();
  const secret = (envOverride.NEON_AUTH_COOKIE_SECRET ?? '').trim();
  return base.startsWith('https://') && secret.length >= 32;
}

type SessionOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

function authBase(envOverride?: Record<string, string | undefined>): string {
  return ((envOverride ?? env()).NEON_AUTH_BASE_URL ?? '').trim().replace(/\/$/, '');
}

export async function getServerSession(headers: Headers | null, options: SessionOptions = {}): Promise<SessionRow | null> {
  const envOverride = options.env ?? env();
  if (!neonAuthConfiguredWith(envOverride) || !headers) return null;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${authBase(envOverride)}${MANAGED_SESSION_PATH}`, {
      method: 'POST',
      headers: { cookie: headers.get('cookie') ?? '' },
      body: '{}',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: { id?: string; email?: string | null }; session?: { id?: string } | null } | null;
    const userId = data?.user?.id;
    if (!userId) return null;
    return { userId, email: data?.user?.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Forward one Better Auth API call to the managed service with the reader's
 * cookie jar; response cookies are copied back so session rotation happens
 * through the reader's own browser.
 */
export async function forwardAuthCall(
  path: string,
  request: Request,
  bodyBytes: ArrayBuffer | string | null,
): Promise<Response> {
  if (!neonAuthConfigured()) {
    return new Response(JSON.stringify({ error: 'auth-unconfigured' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const upstream = new URL(request.url);
  const upstreamPath = `${authBase()}${upstream.pathname.replace(/^\/api\/auth/, '')}${upstream.search}`;
  const headers = new Headers(request.headers);
  headers.set('host', new URL(authBase()).host);
  headers.delete('content-length');
  const forwarded = await fetch(upstreamPath, {
    method: request.method,
    headers,
    body: bodyBytes,
  });
  const responseHeaders = new Headers(forwarded.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');
  return new Response(forwarded.body, { status: forwarded.status, headers: responseHeaders });
}

export const AUTH_PATHS = { SIGN_IN_PATH, SIGN_UP_PATH, SIGN_OUT_PATH, MANAGED_SESSION_PATH };
export type { SessionRow };
