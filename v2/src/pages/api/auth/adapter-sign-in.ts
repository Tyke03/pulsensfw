/**
 * /you sign-in adapter (Managed Better Auth): proxies email+password
 * sign-in to Neon Auth so a native form submission gets a redirect rather
 * than a JSON body. Unconfigured → honest notice; the Neon Auth service
 * itself stays the source of session cookies.
 */
import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { neonAuthConfigured, forwardAuthCall } from '../../../lib/auth/neon';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = String(form.get('return') ?? '/you');
  void back;
  if (!neonAuthConfigured()) {
    return new Response(null, { status: 303, headers: { location: '/you?notice=auth-unconfigured' } });
  }
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email) || password.length < 8) {
    return new Response(null, { status: 303, headers: { location: '/you?notice=auth-invalid' } });
  }
  try {
    const upstream = await forwardAuthCall(
      '/sign-in/email',
      new Request(request.url, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
      null,
    );
    const headers = new Headers({
      location: upstream.ok ? '/you?notice=auth-in' : '/you?notice=auth-failed',
    });
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') headers.append('set-cookie', value);
    });
    return new Response(null, { status: 303, headers });
  } catch {
    return new Response(null, { status: 303, headers: { location: '/you?notice=auth-failed' } });
  }
};
