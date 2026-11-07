/**
 * /you sign-out adapter (Managed Better Auth): posts /sign-out upstream so
 * the managed service clears its own session cookies, then lands the reader
 * back on /you. Reader cookie prefs (age/NSFW/discreet) intentionally
 * survive — they are per-browser safety state, not account data.
 */
import type { APIRoute } from 'astro';
import { safePath } from '../../../lib/http/safe-path';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { neonAuthConfigured, forwardAuthCall } from '../../../lib/auth/neon';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/you'), '/you');
  void back;
  if (neonAuthConfigured()) {
    try {
      const upstream = await forwardAuthCall('/sign-out', new Request(request, { method: 'POST' }), '{}');
      // The managed service's set-cookie headers must reach the browser for
      // the session cookies to actually clear.
      const headers = new Headers({ location: '/you?notice=auth-out' });
      upstream.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') headers.append('set-cookie', value);
      });
      return new Response(null, { status: 303, headers });
    } catch {
      /* The managed service may be down; the local notice stays honest. */
    }
  }
  return redirect('/you?notice=auth-out', 303);
};
