import type { APIRoute } from 'astro';
import { supabaseConfigured, supabaseServer } from '../../../lib/auth/supabase';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';

function wantsJson(request: Request): boolean {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Auth choice: email magic link (OTP), documented in lib/auth/supabase.ts.
 * - No password is stored anywhere on this site; the reader proves control
 *   of the mailbox one time per session. Best fit for a private desk.
 * - Unknown emails still get a "check your inbox" result — never confirm
 *   who has an account.
 * - The emailed link lands on /api/auth/callback, which exchanges the PKCE
 *   code for the session set on reader cookies.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!supabaseConfigured()) {
    if (wantsJson(request)) return Response.json({ ok: false, error: 'auth-unconfigured' }, { status: 503 });
    return redirect('/you?notice=auth-unconfigured', 303);
  }
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/you'), '/you');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    if (wantsJson(request)) return Response.json({ ok: false, error: 'auth-invalid' }, { status: 400 });
    return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=auth-invalid`, 303);
  }
  const origin = new URL(request.url).origin;
  const secure = new URL(request.url).protocol === 'https:';
  const supabase = supabaseServer(request, cookies, secure);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(back)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    if (wantsJson(request)) return Response.json({ ok: false, error: error.message }, { status: 400 });
    return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=auth-failed`, 303);
  }
  if (wantsJson(request)) return Response.json({ ok: true });
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=auth-link-sent`, 303);
};
