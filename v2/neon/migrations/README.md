# migrations (neon/) — HISTORICAL, DO NOT EXECUTE

The 2026-11-06/07 interim replaced Supabase with Neon Postgres + Neon Auth;
these files (`0001_app_current_baseline.sql`) were that round's baseline and
were never applied to any remote branch. The final stack is Supabase again
(gulp: Postgres + Supabase Auth), so this folder is retained purely as
historical material — the live schema lives in
`../supabase/migrations/0001`–`0004`. No tooling reads this folder anymore;
nothing imports from it.
