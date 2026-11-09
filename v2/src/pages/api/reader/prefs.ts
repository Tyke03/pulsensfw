import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import { COOKIE, cookieBase, readReader } from '../../../lib/reader/cookies';

function flag(value: FormDataEntryValue | null): '0' | '1' | null {
  return value === '0' || value === '1' ? value : null;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'));
  const secure = new URL(request.url).protocol === 'https:';
  const discreet = flag(form.get('discreet'));
  const blur = flag(form.get('blur'));
  if (discreet) cookies.set(COOKIE.discreet, discreet, cookieBase(secure));
  if (blur) cookies.set(COOKIE.blur, blur, cookieBase(secure));
  const reader = readReader(cookies, secure);
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;
  if (wantsJson) {
    return Response.json({ ok: true, discreet: reader.discreet, blur: reader.blur });
  }
  const notice = discreet === '1' ? 'discreet-on' : discreet === '0' ? 'discreet-off' : blur === '1' ? 'blur-on' : 'blur-off';
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${notice}`, 303);
};
