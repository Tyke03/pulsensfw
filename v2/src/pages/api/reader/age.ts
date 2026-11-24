import type { APIRoute } from 'astro';
import { getAgeVerificationProvider } from '../../../lib/age/stub-provider';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import { COOKIE, cookieBase } from '../../../lib/reader/cookies';

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
    vendorPayload: provider.id === 'vendor.v1'
      ? { token: String(form.get('token') ?? '') }
      : { over18: String(form.get('over18') ?? '') },
  });
  if (!result.ok) {
    const code = result.reason?.startsWith('vendor') ? 'age-vendor-failed' : 'age-failed';
    const failed = `${back}${back.includes('?') ? '&' : '?'}notice=${code}`;
    if (wantsJson(request)) return Response.json({ ok: false, reason: result.reason }, { status: 400 });
    return redirect(failed, 303);
  }
  // The cookie stores the provider marker only — never a document, selfie,
  // or card number. The vendor keeps its own records.
  cookies.set(COOKIE.age, provider.id, cookieBase(secure));
  if (wantsJson(request)) return Response.json({ ok: true, reload: true });
  return redirect(back, 303);
};
