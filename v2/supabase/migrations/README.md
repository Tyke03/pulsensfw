# migrations/ (supabase/legacy) — HISTORICAL, DO NOT EXECUTE

These files described the round 2D–2G Supabase implementation (RLS policies,
auth.users foreign keys, service-role access). The 2026-11 stack correction
replaced Supabase with Neon Postgres + Neon Auth (Managed Better Auth):

- The live schema lives in `v2/neon/migrations/0001_app_current_baseline.sql`
  (plain Postgres; no RLS roles — service-layer isolation instead).
- These files are retained as historical material only. They are NOT applied
  by any tool anymore, and no consumer imports them. Do not run
  `supabase db push` against anything from this folder.

| Historical file | Replaced by |
|---|---|
| 0001_reader_profiles.sql | 0001_app_current_baseline.sql § reader tables |
| 0002_agent_content.sql   | 0001_app_current_baseline.sql § agent pipeline |
| 0003_model_usage.sql     | 0001_app_current_baseline.sql § model usage |
