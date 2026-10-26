import type { APIRoute } from 'astro';
import { getAgeVerificationProvider } from '../../../lib/age/stub-provider';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import { AGE_STUB_VALUE, COOKIE, cookieBase } from '../../../lib/reader/cookies';

function wantsJson(request: Request) {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'));
  const secure = new URL(request.url).protocol === 'https:';
  const provider = getAgeVerificationProvider();
  const result = await provider.verify({
    providerId: provider.id,
    vendorPayload: { over18: String(form.get('over18') ?? '') },
  });
  if (!result.ok) {
    const failed = `${back}${back.includes('?') ? '&' : '?'}notice=age-failed`;
    if (wantsJson(request)) return Response.json({ ok: false }, { status: 400 });
    return redirect(failed, 303);
  }
  cookies.set(COOKIE.age, AGE_STUB_VALUE, cookieBase(secure));
  if (wantsJson(request)) return Response.json({ ok: true, reload: true });
  return redirect(back, 303);
};
