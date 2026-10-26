import type { APIRoute } from 'astro';
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
  const notice = enabled ? 'nsfw-on' : 'nsfw-off';
  if (wantsJson(request)) return Response.json({ ok: true, nsfw: enabled, reload: true });
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${notice}`, 303);
};
