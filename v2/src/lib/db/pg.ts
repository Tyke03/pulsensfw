/**
 * Postgres access seam (stack correction, 2026-11 round).
 *
 * Production transport: the official Neon serverless driver
 * (`@neondatabase/serverless`) over HTTP — `neon()` one-shot queries and
 * `neon().transaction()` for a batch of statements in one non-interactive
 * transaction. Chosen from current official docs:
 *   https://neon.com/docs/serverless/serverless-driver (accessed 2026-11-07)
 * — explicitly documented as the Cloudflare-Workers path (no TCP, no Vercel
 * deployment, no Neon Functions, no Data API). Credentials stay server-side.
 *
 * Local tests use @electric-sql/pglite (in-process WASM Postgres) through the
 * SAME tiny `PGRunner` interface, so SQL and transaction behavior is tested
 * against real Postgres without touching any remote branch. pglite is a test
 * tool only — production always talks to Neon over the official driver.
 */
import { neon } from '@neondatabase/serverless';

export type ParameterValue = string | number | boolean | null | Record<string, unknown> | unknown[];
export type PGRow = Record<string, unknown>;

/** One parameterized statement run, returning plain rows. */
export type PGQuery = { statement: string; params?: ParameterValue[] };

/**
 * The minimal runner both transports satisfy. Implementations return plain
 * row arrays; the Neon one normalizes the driver's union result shapes.
 */
export type PGRunner = {
  /** Execute one statement; return its rows as objects. */
  query: (statement: string, params?: ParameterValue[]) => Promise<PGRow[]>;
  /** Batch statements in one transaction (all-or-nothing semantics upstream). */
  transaction: (statements: PGQuery[]) => Promise<PGRow[][]>;
};

function env(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

function neonUrl(): string {
  return (env().NEON_DATABASE_URL ?? env().DATABASE_URL ?? '').trim();
}

let cachedNeon: ReturnType<typeof neon> | null = null;

/** Returns null when the Neon env is absent — callers keep honest state. */
export async function neonRunner(): Promise<PGRunner | null> {
  const url = neonUrl();
  if (!url) return null;
  if (!cachedNeon) cachedNeon = neon(url);
  const queryFn = cachedNeon;
  const runner: PGRunner = {
    async query(statement, params = []) {
      const result = await queryFn.query(statement, params as never[]);
      if (Array.isArray(result)) return result as PGRow[];
      return ((result as { rows?: PGRow[] }).rows ?? []) as PGRow[];
    },
    async transaction(statements) {
      const batch = statements.map(({ statement, params = [] }) =>
        queryFn.query(statement, params as never[]),
      );
      const results = await queryFn.transaction(batch as never);
      return results.map((result) => {
        if (Array.isArray(result)) return result as PGRow[];
        return ((result as { rows?: PGRow[] }).rows ?? []) as PGRow[];
      });
    },
  };
  return runner;
}

/** Throws the honest unconfigured code when the Neon env is absent. */
export async function requireNeon(): Promise<PGRunner> {
  const runner = await neonRunner();
  if (!runner) throw new Error('neon-unconfigured');
  return runner;
}

export function neonConfigured(): boolean {
  return neonUrl().length > 0;
}
