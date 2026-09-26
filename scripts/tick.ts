/**
 * scripts/tick.ts — run one orchestrator tick from the CLI.
 * Usage:
 *   ORCHESTRATOR_MODE=shadow DATABASE_URL=... npx tsx scripts/tick.ts
 * Safety: mode comes from env (default dry_run). No production side effects
 * unless ORCHESTRATOR_MODE=production is explicitly set (Brent only).
 */
import 'dotenv/config';
import { tick, currentMode } from '../server/orchestrator/engine';
import { PollinationsInvoker } from '../server/orchestrator/invoker';
import { pool } from '../server/db';

async function main() {
  const mode = currentMode();
  console.log(`[tick] mode=${mode} enabled=${process.env.ORCHESTRATOR_ENABLED !== 'false'}`);
  const invoker = new PollinationsInvoker();
  const t0 = Date.now();
  const result = await tick({ invoker });
  console.log(`[tick] completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch(err => { console.error('[tick] failed:', err?.message ?? err); process.exit(1); });
