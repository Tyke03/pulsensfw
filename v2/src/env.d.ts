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

  /* External-agent access (round 2E). Server-only bearer keys, one per scope. */
  readonly AGENT_DRAFT_KEY?: string;
  readonly AGENT_PUBLISH_KEY?: string;
  /** Dev-only: serve the mutable in-memory agent store when "memory" is set. */
  readonly AGENT_DEV_STORE?: 'memory' | '';

  /* Model ladder + Concierge (round 2F). Server-only. Empty = honest unavailable. */
  readonly MODELS_MAIN_API_URL?: string;
  readonly MODELS_MAIN_API_KEY?: string;
  readonly MODELS_MAIN_IDS?: string;
  readonly MODELS_FALLBACK_API_URL?: string;
  readonly MODELS_FALLBACK_API_KEY?: string;
  readonly MODELS_FALLBACK_IDS?: string;
  readonly CONCIERGE_MAX_ATTEMPTS?: string;
  readonly CONCIERGE_TIMEOUT_MS?: string;
  readonly CONCIERGE_SESSION_MAX_TURNS?: string;
  readonly CONCIERGE_TOKEN_CEILING?: string;
  readonly CONCIERGE_CONCURRENCY?: string;
  readonly MODEL_DAILY_COST_CAP_USD?: string;
  /** Dev-only fixture model provider for UI screenshots; never production. */
  readonly CONCIERGE_DEV_MOCK?: '1' | '';

  /* Amazon SES mail (round 2D). Empty = subscribe/contact report "not configured". */
  readonly MAIL_REGION?: string;
  readonly MAIL_ACCESS_KEY_ID?: string;
  readonly MAIL_SECRET_ACCESS_KEY?: string;
  readonly MAIL_FROM?: string;
  readonly MAIL_REPLY_TO?: string;
  readonly NEWS_TO?: string;
}
