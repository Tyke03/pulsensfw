import type { APIRoute } from 'astro';
import { getReaderSession, profileTablesConfigured, supabaseAdmin } from '../../../lib/auth/supabase';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import { COOKIE, cookieBase, readReader } from '../../../lib/reader/cookies';

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'));
  const secure = new URL(request.url).protocol === 'https:';
  const reader = readReader(cookies, secure);
  const enabled = String(form.get('enabled') ?? '') === '1';
  if (enabled && !reader.ageVerified) {
    const locked = `${back}${back.includes('?') ? '&' : '?'}notice=nsfw-locked`;
    if (wantsJson(request)) return Response.json({ ok: false, error: 'age-required' }, { status: 403 });
    return redirect(locked, 303);
  }
  cookies.set(COOKIE.nsfw, enabled ? '1' : '0', cookieBase(secure));
  // Signed-in readers: mirror the choice into the Supabase profile. The
  // cookie stays the fast path used by every page render.
  if (profileTablesConfigured()) {
    const session = await getReaderSession(request, cookies, secure);
    if (session) {
      try {
        await supabaseAdmin()
          .from('reader_profiles')
          .upsert({ user_id: session.userId, nsfw_pref: enabled, updated_at: new Date().toISOString() });
      } catch {
        /* Cookie already saved; profile sync retries on the next toggle. */
      }
    }
  }
  const notice = enabled ? 'nsfw-on' : 'nsfw-off';
  if (wantsJson(request)) return Response.json({ ok: true, nsfw: enabled, reload: true });
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${notice}`, 303);
};
