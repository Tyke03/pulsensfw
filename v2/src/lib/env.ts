/**
 * Runtime-safe environment reader for Cloudflare Workers + Node/Vite dev.
 *
 * Vite statically replaces direct `import.meta.env.KEY` property accesses with
 * `void 0` at build time whenever `KEY` is absent from a local `.env` file,
 * which silently wipes runtime Cloudflare Worker secrets set via
 * `wrangler secret put`.
 *
 * Reading `process.env[name]` first (populated automatically by Cloudflare
 * Workers `nodejs_compat` with compatibility_date >= 2025-04-01, and by Node
 * tests) with a dynamic fallback to `import.meta.env` ensures secrets work in
 * both production Workers and local dev.
 */
export function runtimeEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const fromProc = proc?.[name];
  if (typeof fromProc === 'string' && fromProc.length > 0) return fromProc;
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const fromMeta = meta?.[name];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  return undefined;
}

export function runtimeEnvRecord(): Record<string, string | undefined> {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return { ...meta, ...proc };
}
