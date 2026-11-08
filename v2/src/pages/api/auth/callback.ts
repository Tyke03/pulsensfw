import type { APIRoute } from 'astro';
import { supabaseConfigured, supabaseServer } from '../../../lib/auth/supabase';
import { safePath } from '../../../lib/http/safe-path';

/**
 * Email-link landing: exchanges the PKCE code for a session, sets the
 * reader cookies, then returns to /you. Never echoes an error detail beyond
 * the notice code.
 */
export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  if (!supabaseConfigured()) return redirect('/you?notice=auth-unconfigured', 303);
  const next = safePath(url.searchParams.get('next') ?? '/you', '/you');
  const code = url.searchParams.get('code');
  const linkError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (!code || linkError) return redirect(`${next}${next.includes('?') ? '&' : '?'}notice=auth-failed`, 303);
  const secure = new URL(request.url).protocol === 'https:';
  const supabase = supabaseServer(request, cookies, secure);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirect(`${next}${next.includes('?') ? '&' : '?'}notice=auth-failed`, 303);
  return redirect(`${next}${next.includes('?') ? '&' : '?'}notice=auth-in`, 303);
};
