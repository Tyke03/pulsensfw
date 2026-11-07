import type { APIRoute } from 'astro';
import { getServerSession, neonAuthConfigured } from '../../../lib/auth/neon';
import { upsertReaderFollow, removeReaderFollow } from '../../../lib/auth/reader-store';
import { requireNeon } from '../../../lib/db/pg';
import { isSameOrigin } from '../../../lib/http/same-origin';
import { safePath } from '../../../lib/http/safe-path';
import type { EntityKind } from '../../../lib/content/types';

const KINDS: readonly EntityKind[] = ['star', 'site', 'ai', 'product', 'game'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Follow / unfollow a star, site, or AI app for the signed-in reader.
 * Server-verified session only; every write is scoped by the session's
 * user_id. Guests keep the honest "sign in first" notice.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'), '/');
  const slug = String(form.get('slug') ?? '').trim().toLowerCase();
  const kind = String(form.get('kind') ?? '') as EntityKind;
  const wantOn = String(form.get('on') ?? '1') === '1';
  const noticePath = `${back}${back.includes('?') ? '&' : '?'}notice=`;
  if (!neonAuthConfigured()) return redirect(`${noticePath}auth-unconfigured`, 303);
  if (!SLUG_RE.test(slug) || !KINDS.includes(kind)) return redirect(`${noticePath}follow-invalid`, 303);
  const session = await getServerSession(request.headers);
  if (!session) return redirect(`${noticePath}follow-guest`, 303);
  const runner = await requireNeon();
  if (wantOn) await upsertReaderFollow(runner, session.userId, slug, kind);
  else await removeReaderFollow(runner, session.userId, slug);
  return redirect(`${noticePath}${wantOn ? 'followed-on' : 'followed-off'}`, 303);
};
