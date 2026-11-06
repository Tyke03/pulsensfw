/// <reference types="astro/client" />

/**
 * Server env contract. Placeholders stay empty in git — see `.env.example`.
 * PUBLIC_* values may reach the browser bundle; every other key is
 * server-side only (never sent to the reader's browser).
 */
interface ImportMetaEnv {
  /* Supabase reader accounts (round 2D) */
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Server-only. Bypasses RLS; never ship to the client. */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;

  /* Age verification vendor seam (round 2D). Empty = built-in stub stays on. */
  readonly AGE_VENDOR_API_URL?: string;
  readonly AGE_VENDOR_API_KEY?: string;

  /* Amazon SES mail (round 2D). Empty = subscribe/contact report "not configured". */
  readonly MAIL_REGION?: string;
  readonly MAIL_ACCESS_KEY_ID?: string;
  readonly MAIL_SECRET_ACCESS_KEY?: string;
  readonly MAIL_FROM?: string;
  readonly MAIL_REPLY_TO?: string;
  readonly NEWS_TO?: string;
}
