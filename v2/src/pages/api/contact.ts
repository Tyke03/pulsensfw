import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/http/same-origin';
import { safePath } from '../../lib/http/safe-path';

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/contact'));
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const notice = name && emailOk && message ? 'contact-unconfigured' : 'contact-invalid';
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=${notice}`, 303);
};
