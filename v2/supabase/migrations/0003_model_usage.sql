-- 0003_model_usage.sql
-- Usage accounting for the shared model ladder (round 2F).
--
-- Daily aggregate per session + model. Session hashes are one-way (reader
-- seed or agent key fingerprint), never raw identifiers and never prompt
-- content. Cost is stored in micro-USD when the model price is configured;
-- unknown pricing leaves cost null and the ceiling runs on tokens only.
-- RLS: service-role only (no anon policies), same posture as 0002.

create table if not exists model_usage_daily (
  day date not null,
  session_hash text not null,
  model_id text not null,
  calls integer not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  est_cost_micro_usd bigint,
  primary key (day, session_hash, model_id)
);

create index if not exists model_usage_day_idx on model_usage_daily (day);

alter table model_usage_daily enable row level security;
-- No policies: aggregate accounting is service-role only.

-- Atomic upsert used by the server (service-role) to keep daily totals.
create or replace function public.bump_model_usage_daily(
  p_day date,
  p_session text,
  p_model text,
  p_prompt bigint,
  p_completion bigint,
  p_cost_micro bigint
) returns void language sql as $$
  insert into model_usage_daily as u (day, session_hash, model_id, calls, prompt_tokens, completion_tokens, est_cost_micro_usd)
  values (p_day, p_session, p_model, 1, p_prompt, p_completion, p_cost_micro)
  on conflict (day, session_hash, model_id) do update set
    calls = model_usage_daily.calls + 1,
    prompt_tokens = model_usage_daily.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = model_usage_daily.completion_tokens + excluded.completion_tokens,
    est_cost_micro_usd = case
      when excluded.est_cost_micro_usd is null then model_usage_daily.est_cost_micro_usd
      else coalesce(model_usage_daily.est_cost_micro_usd, 0) + excluded.est_cost_micro_usd
    end;
$$;

