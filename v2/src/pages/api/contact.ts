import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/http/same-origin';
import { safePath } from '../../lib/http/safe-path';
import { mailConfig, sendPlainEmail } from '../../lib/mail/ses';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contact form (round 2D upgrade): mails the desk through the shared SES
 * helper when configured; keeps the honest "not configured" notice when it
 * is not. Nothing is stored either way.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const back = safePath(String(form.get('return') ?? '/contact'), '/contact');
  const join = `${back}${back.includes('?') ? '&' : '?'}notice=`;
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const message = String(form.get('message') ?? '').trim();
  if (!(name && EMAIL_RE.test(email) && message)) {
    return redirect(`${join}contact-invalid`, 303);
  }
  const config = mailConfig();
  const inbox = config?.contactInbox ?? null;
  if (!config || !inbox) {
    return redirect(`${join}contact-unconfigured`, 303);
  }
  const result = await sendPlainEmail(config, {
    to: inbox,
    subject: `Desk note from ${name}`,
    text: `${message}\n\n— ${name} (${email})`,
  });
  if (!result.sent) {
    return redirect(`${join}contact-unconfigured`, 303);
  }
  return redirect(`${join}contact-sent`, 303);
};
