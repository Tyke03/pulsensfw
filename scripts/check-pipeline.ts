/**
 * scripts/check-pipeline.ts — one-off pipeline health readout.
 * Usage: DATABASE_URL=... npx tsx scripts/check-pipeline.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

const isLocal = /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  const states = await pool.query("SELECT state, count(*)::int AS n FROM work_items GROUP BY state ORDER BY n DESC");
  console.log('work_items by state:');
  for (const r of states.rows) console.log(' ', r.state, r.n);

  const past = await pool.query(
    "SELECT count(*)::int AS n FROM work_items WHERE state IN ('draft_proposed','draft_persisted','visual_pending','needs_visual','visual_ready','end_rail_pending','end_rail_validated','qc_pending','qc_pass','publish_eligible')"
  );
  console.log('items at/past draft:', past.rows[0].n);

  const writers = await pool.query(
    "SELECT id, state, attempt_count, max_attempts, left(last_error::text, 70) AS err FROM work_items WHERE role LIKE 'writer%' ORDER BY id DESC LIMIT 10"
  );
  console.log('--- recent writer items ---');
  for (const r of writers.rows) console.log(' ', r.id, r.state, `att ${r.attempt_count}/${r.max_attempts}`, r.err ?? '');

  const runs = await pool.query(
    "SELECT status, count(*)::int AS n FROM agent_runs WHERE created_at > now() - interval '30 minutes' GROUP BY status ORDER BY n DESC"
  );
  console.log('agent_runs last 30min:');
  for (const r of runs.rows) console.log(' ', r.status, r.n);

  const posts = await pool.query("SELECT id, status, left(title, 40) AS title FROM posts ORDER BY id DESC LIMIT 3");
  console.log('latest posts:');
  for (const r of posts.rows) console.log(' ', r.id, r.status, r.title);
} finally {
  await pool.end();
}
