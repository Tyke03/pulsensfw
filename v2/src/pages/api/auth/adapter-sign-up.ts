/**
 * /you sign-up adapter (Managed Better Auth): proxies email+password
 * sign-up to Neon Auth (Better Auth semantics — new account creation is
 * explicit, never a silent side effect of sign-in). Unconfigured → honest
 * notice redirect; the managed service stays the session authority.
 */
import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { neonAuthConfigured, forwardAuthCall } from '../../../lib/auth/neon';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 80) || 'Reader';
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!neonAuthConfigured()) {
    return new Response(null, { status: 303, headers: { location: '/you?notice=auth-unconfigured' } });
  }
  if (!emailRe.test(email) || password.length < 8) {
    return new Response(null, { status: 303, headers: { location: '/you?notice=auth-invalid' } });
  }
  try {
    const upstream = await forwardAuthCall(
      '/sign-up/email',
      new Request(request.url, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
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
