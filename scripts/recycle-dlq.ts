/**
 * scripts/recycle-dlq.ts — one-off operator script.
 * Applies 002_retry_budget.sql and recycles terminal_failure shadow items
 * back into the writing queue with a fresh retry budget and audit entry.
 * Usage: DATABASE_URL=... npx tsx scripts/recycle-dlq.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'node:fs';

const isLocal = /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const historyEntry = JSON.stringify([{
  from: 'terminal_failure',
  to: 'ready_to_write',
  actor: 'operator-recycle',
  reason: 'shadow DLQ recycle: retry budget raised to 12',
  at: new Date().toISOString(),
}]);

try {
  await pool.query(fs.readFileSync('server/migrations/002_retry_budget.sql', 'utf-8'));
  console.log('migration 002 applied');

  const r = await pool.query(
    `UPDATE work_items
       SET state = 'ready_to_write', attempt_count = 0, max_attempts = 12,
           backoff_until = NULL, last_error = NULL,
           transition_history = transition_history || $1::jsonb
     WHERE state = 'terminal_failure'
     RETURNING id`,
    [historyEntry],
  );
  console.log('recycled items:', r.rows.map(x => x.id).join(',') || '(none)');

  await pool.query(
    `INSERT INTO orchestration_events (type, mode, actor, detail)
     VALUES ('dlq_recycle', 'shadow', 'operator', $1)`,
    [JSON.stringify({ recycled: r.rows.map(x => x.id), reason: 'retry budget raised to 12' })],
  );

  const chk = await pool.query('SELECT state, count(*)::int AS n FROM work_items GROUP BY state ORDER BY n DESC');
  console.log('work_items by state:');
  for (const c of chk.rows) console.log(' ', c.state, c.n);
} finally {
  await pool.end();
}
