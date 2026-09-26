import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Neon and other remote hosts require SSL; local test Postgres does not support it.
const isLocal = /(localhost|127\.0\.0\.1|::1)/.test(process.env.DATABASE_URL ?? '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});

export const db = drizzle(pool, { schema });
