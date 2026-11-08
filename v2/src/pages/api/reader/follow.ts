import type { APIRoute } from 'astro';
import { getReaderSession, profileTablesConfigured, supabaseAdmin } from '../../../lib/auth/supabase';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import type { EntityKind } from '../../../lib/content/types';

const KINDS: readonly EntityKind[] = ['star', 'site', 'ai', 'product', 'game'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Follow / unfollow a star, site, or AI app for the signed-in reader.
 * Guests get an honest "sign in first" notice; nothing is stored in cookies.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'), '/');
  const slug = String(form.get('slug') ?? '').trim().toLowerCase();
  const kind = String(form.get('kind') ?? '') as EntityKind;
  const wantOn = String(form.get('on') ?? '1') === '1';
  const noticePath = `${back}${back.includes('?') ? '&' : '?'}notice=`;
  if (!profileTablesConfigured()) return redirect(`${noticePath}auth-unconfigured`, 303);
  if (!SLUG_RE.test(slug) || !KINDS.includes(kind)) return redirect(`${noticePath}follow-invalid`, 303);
  const session = await getReaderSession(request, cookies, new URL(request.url).protocol === 'https:');
  if (!session) return redirect(`${noticePath}follow-guest`, 303);
  if (wantOn) {
    await supabaseAdmin().from('follows').upsert({ user_id: session.userId, slug, kind });
  } else {
    await supabaseAdmin().from('follows').delete().eq('user_id', session.userId).eq('slug', slug);
  }
  return redirect(`${noticePath}${wantOn ? 'followed-on' : 'followed-off'}`, 303);
};
