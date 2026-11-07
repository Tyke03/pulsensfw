/**
 * Reader profile store (accounts round, stack correction 2026-11).
 *
 * Neon Postgres tables (`reader_profiles`, `reader_saved`, `reader_follows` —
 * see v2/neon/migrations/0001_app_current_baseline.sql). Isolation is
 * enforced HERE, in every statement, through `user_id` equality taken from
 * the server-verified Neon Auth session — never from form input. This is the
 * explicit replacement of the legacy Supabase RLS/auth.uid() pattern,
 * documented because managed Neon Auth does not create RLS policies
 * automatically.
 */
import type { PGRunner } from '../db/pg';

export type ReaderProfileRow = { user_id: string; nsfw_pref: boolean; created_at: string; updated_at: string };
export type ReaderItemRow = { slug: string; kind: string; created_at: string };

/** Read one profile. No row → null (first sign-in seeds it). */
export async function getReaderProfile(runner: PGRunner, userId: string): Promise<ReaderProfileRow | null> {
  const rows = await runner.query('SELECT user_id, nsfw_pref, created_at, updated_at FROM reader_profiles WHERE user_id = $1 LIMIT 1', [userId]);
  return (rows.at(0) ?? null) as ReaderProfileRow | null;
}

/** Seed-or-update the NSFW flag for one reader (always scoped by user_id). */
export async function upsertReaderProfile(runner: PGRunner, userId: string, nsfwPref: boolean): Promise<void> {
  await runner.query(
    'INSERT INTO reader_profiles (user_id, nsfw_pref) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET nsfw_pref = EXCLUDED.nsfw_pref, updated_at = now()',
    [userId, nsfwPref],
  );
}

export async function upsertReaderSaved(runner: PGRunner, userId: string, slug: string, kind: string): Promise<void> {
  await runner.query(
    'INSERT INTO reader_saved (user_id, slug, kind) VALUES ($1, $2, $3) ON CONFLICT (user_id, slug) DO UPDATE SET kind = EXCLUDED.kind',
    [userId, slug, kind],
  );
}

export async function removeReaderSaved(runner: PGRunner, userId: string, slug: string): Promise<void> {
  await runner.query('DELETE FROM reader_saved WHERE user_id = $1 AND slug = $2', [userId, slug]);
}

export async function listReaderSaved(runner: PGRunner, userId: string): Promise<ReaderItemRow[]> {
  return await runner.query(
    'SELECT slug, kind, created_at FROM reader_saved WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
    [userId],
  ) as ReaderItemRow[];
}

export async function upsertReaderFollow(runner: PGRunner, userId: string, slug: string, kind: string): Promise<void> {
  await runner.query(
    'INSERT INTO reader_follows (user_id, slug, kind) VALUES ($1, $2, $3) ON CONFLICT (user_id, slug) DO UPDATE SET kind = EXCLUDED.kind',
    [userId, slug, kind],
  );
}

export async function removeReaderFollow(runner: PGRunner, userId: string, slug: string): Promise<void> {
  await runner.query('DELETE FROM reader_follows WHERE user_id = $1 AND slug = $2', [userId, slug]);
}

export async function listReaderFollows(runner: PGRunner, userId: string): Promise<ReaderItemRow[]> {
  return await runner.query(
    'SELECT slug, kind, created_at FROM reader_follows WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
    [userId],
  ) as ReaderItemRow[];
}
