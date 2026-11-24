import { defineMiddleware } from 'astro:middleware';
import { supabaseConfigured, supabaseServer } from './lib/auth/supabase';

/**
 * Refresh the Supabase session on every request so access tokens rotate
 * through the reader's browser cookies. Skipped entirely when the Supabase
 * env is not configured (cookie-only reader state keeps working).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (supabaseConfigured()) {
    const secure = context.url.protocol === 'https:';
    try {
      await supabaseServer(context.request, context.cookies, secure).auth.getUser();
    } catch {
      /* Session refresh is best-effort; pages keep rendering either way. */
    }
  }
  return next();
});
