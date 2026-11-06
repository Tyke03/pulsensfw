/**
 * Supabase server wiring (round 2D).
 *
 * Auth choice: email magic link (one-time link; no password stored here).
 * - The anon key (PUBLIC_SUPABASE_*) is safe to expose to the browser; it
 *   grants nothing without a session and RLS restricts every table to
 *   the user's own rows.
 * - SUPABASE_SERVICE_ROLE_KEY never reaches the client bundle. It is read
 *   only in server code (API routes / middleware / Cloudflare bindings) and
 *   bypasses RLS — every write through it scopes by the user_id taken from
 *   the verified session, never from form input.
 *
 * When the env is not configured the helpers no-op so local `npm run dev`
 * keeps working with cookie-only reader state.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export type ReaderSession = {
  userId: string;
  email: string | null;
};

function sbChunk(name: string): boolean {
  // @supabase/ssr splits the token: sb-<ref>-auth-token.<n>
  return /^sb-.+-auth-token(\.\d+)?$/.test(name) || name === 'sb-auth-token';
}

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
}

function url(): string {
  return String(import.meta.env.PUBLIC_SUPABASE_URL ?? '');
}

function anonKey(): string {
  return String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '');
}

/** Supabase session cookies are read from the incoming request header. */
function sessionCookiePairs(request: Request): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  const header = request.headers.get('cookie');
  if (!header) return pairs;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (sbChunk(name.toLowerCase())) pairs.push({ name, value });
  }
  return pairs;
}

/**
 * Session-scoped client: reads session cookies from the request, writes
 * rotated ones through Astro cookies. Call in middleware/UI/API routes.
 */
export function supabaseServer(
  request: Request,
  cookies: AstroCookies,
  secure: boolean,
): SupabaseClient {
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll() {
        return sessionCookiePairs(request);
      },
      setAll(entries) {
        for (const { name, value, options } of entries) {
          const maxAge = typeof options?.maxAge === 'number' ? options.maxAge : 60 * 60 * 24 * 400;
          cookies.set(name, value, {
            path: options?.path ?? '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: secure || Boolean(options?.secure),
            maxAge,
          });
        }
      },
    },
  });
}

/** Session info or null. Safe to call when Supabase env is absent. */
export async function getReaderSession(
  request: Request,
  cookies: AstroCookies,
  secure: boolean,
): Promise<ReaderSession | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { data } = await supabaseServer(request, cookies, secure).auth.getUser();
    const user = data.user;
    if (!user) return null;
    return { userId: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Service-role client for trusted profile writes. Server-only use; throws
 * at call time when the key is absent, so UI can check first.
 */
export function supabaseAdmin(): SupabaseClient {
  const serviceKey = String(import.meta.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  if (!supabaseConfigured() || !serviceKey) {
    throw new Error('Supabase service role is not configured');
  }
  return createClient(url(), serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function profileTablesConfigured(): boolean {
  return supabaseConfigured() && Boolean(import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
}
