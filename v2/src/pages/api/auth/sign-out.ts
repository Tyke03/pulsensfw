import type { APIRoute } from 'astro';
import { supabaseConfigured, supabaseServer } from '../../../lib/auth/supabase';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';

/**
 * Sign out: clears the Supabase session and its cookies. Reader cookie
 * preferences (age gate / NSFW / discreet / blur) intentionally survive —
 * they are per-browser safety state, not account data.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/you'), '/you');
  if (supabaseConfigured()) {
    try {
      const secure = new URL(request.url).protocol === 'https:';
      await supabaseServer(request, cookies, secure).auth.signOut();
    } catch {
      /* fall through to the notice */
    }
  }
  if ((request.headers.get('accept') ?? '').includes('application/json')) {
    return Response.json({ ok: true });
  }
  return redirect(`${back}${back.includes('?') ? '&' : '?'}notice=auth-out`, 303);
};
