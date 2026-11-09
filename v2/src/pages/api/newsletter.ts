import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/http/same-origin';
import { safePath } from '../../lib/http/safe-path';
import { mailConfig, sendPlainEmail } from '../../lib/mail/ses';

function wantsJson(request: Request): boolean {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter subscribe (round 2D). Server-side Amazon SES only.
 * Sends ONE plain-text confirmation; no HTML marketing blasts. When the SES
 * env is unset the API answers "not configured" and never pretends success.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/'), '/');
  const join = `${back}${back.includes('?') ? '&' : '?'}notice=`;
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    if (wantsJson(request)) return Response.json({ ok: false, error: 'news-invalid' }, { status: 400 });
    return redirect(`${join}news-invalid`, 303);
  }
  const config = mailConfig();
  if (!config) {
    if (wantsJson(request)) return Response.json({ ok: false, error: 'news-unconfigured' }, { status: 503 });
    return redirect(`${join}news-unconfigured`, 303);
  }
  const result = await sendPlainEmail(config, {
    to: email,
    subject: 'PulseNSFW list confirmation',
    text: [
      'You asked to stay on the PulseNSFW list.',
      '',
      'The desk is live at https://pulsensfw.com/.',
      'If this was not you, ignore this note — nothing else happens.',
    ].join('\n'),
    replyTo: config.replyTo,
  });
  if (!result.sent) {
    if (wantsJson(request)) return Response.json({ ok: false, error: 'news-error' }, { status: 502 });
    return redirect(`${join}news-error`, 303);
  }
  if (wantsJson(request)) return Response.json({ ok: true });
  return redirect(`${join}news-sent&email=${encodeURIComponent(email)}`, 303);
};
