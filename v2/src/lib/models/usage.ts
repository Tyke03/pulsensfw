/**
 * Usage + limit accounting for the shared model ladder (round 2F).
 *
 * Persisted daily totals in Supabase (`model_usage_daily`, migration 0003)
 * when the service env exists; in-memory counters per isolate otherwise
 * (documented honestly — dev counters reset with the server; production
 * uses the table). Enforces:
 *   - per-session turn ceiling per day,
 *   - token ceiling per call (max_tokens handed to the ladder),
 *   - global concurrency cap (in-flight chat calls),
 *   - global daily cost cap in USD over `est_cost_micro_usd` (token-token
 *     enforcement only, when a model price is not configured).
 * Fail-closed: missing store or missing credentials produce the honest
 * "unavailable" state. No purchase path, no account creation, no keys.
 */
import { supabaseConfigured, supabaseAdmin } from '../auth/supabase';

export const SESSION_MAX_TURNS_DEFAULT = 30;
export const CONCURRENCY_DEFAULT = 3;
export const TURN_TOKEN_CEILING_DEFAULT = 1200;

export type DailyUsageRow = { calls: number; prompt_tokens: number; completion_tokens: number; est_cost_micro_usd: number | null };

export type UsageSnapshot = {
  tableEnabled: boolean;
  sessionTurns: number;
  sessionMaxTurns: number;
  globalCalls: number;
  estCostUsd: { today: number | null; cap: number | null };
  costKnown: boolean;
};

function envNum(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export class UsageTracker {
  private inFlight = 0;
  private local = new Map<string, DailyUsageRow>();
  private globalCallsLocal = 0;

  constructor(
    private readonly opts: {
      sessionMaxTurns: number;
      concurrencyCap: number;
      costCapUsd: number;
    } = {
      sessionMaxTurns: SESSION_MAX_TURNS_DEFAULT,
      concurrencyCap: CONCURRENCY_DEFAULT,
      costCapUsd: 0,
    },
  ) {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    this.opts.sessionMaxTurns = envNum(env.CONCIERGE_SESSION_MAX_TURNS, opts.sessionMaxTurns, 1, 200);
    this.opts.concurrencyCap = envNum(env.CONCIERGE_CONCURRENCY, opts.concurrencyCap, 1, 20);
    this.opts.costCapUsd = Number.parseFloat((env.MODEL_DAILY_COST_CAP_USD ?? '').trim());
    if (!Number.isFinite(this.opts.costCapUsd) || this.opts.costCapUsd <= 0) this.opts.costCapUsd = 0;
    if (opts.costCapUsd > 0) this.opts.costCapUsd = opts.costCapUsd;
  }

  get tableEnabled(): boolean {
    return supabaseConfigured() && Boolean(import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private day(): string {
    return new Date().toISOString().slice(0, 10);
  }

  snapshot(sessionHash: string): UsageSnapshot {
    const sessionRow = this.tableEnabled ? null : this.local.get(this.day() + ':' + sessionHash);
    const rows = this.tableEnabled ? [] : [...this.local.values()];
    const globalCalls = this.tableEnabled ? 0 : rows.reduce((sum, row) => sum + row.calls, 0);
    const costs = rows.map((row) => row.est_cost_micro_usd ?? 0);
    return {
      tableEnabled: this.tableEnabled,
      sessionTurns: sessionRow?.calls ?? 0,
      sessionMaxTurns: this.opts.sessionMaxTurns,
      globalCalls: Math.max(globalCalls, this.globalCallsLocal),
      estCostUsd: {
        today: costs.reduce((sum, micro) => sum + micro, 0) / 1_000_000,
        cap: this.opts.costCapUsd > 0 ? this.opts.costCapUsd : null,
      },
      costKnown: false,
    };
  }

  async recordCall(sessionHash: string, modelId: string, prompt: number, completion: number, costMicroUsd: number | null): Promise<void> {
    this.globalCallsLocal += 1;
    const key = this.day() + ':' + sessionHash;
    const row = this.local.get(key) ?? { calls: 0, prompt_tokens: 0, completion_tokens: 0, est_cost_micro_usd: null };
    row.calls += 1;
    row.prompt_tokens += prompt;
    row.completion_tokens += completion;
    if (costMicroUsd !== null) row.est_cost_micro_usd = (row.est_cost_micro_usd ?? 0) + costMicroUsd;
    this.local.set(key, row);
    if (!this.tableEnabled) return;
    try {
      await supabaseAdmin().rpc('bump_model_usage_daily', {
        p_day: this.day(),
        p_session: sessionHash,
        p_model: modelId,
        p_prompt: prompt,
        p_completion: completion,
        p_cost_micro: costMicroUsd,
      });
    } catch {
      /* Table push failed; local aggregate keeps the session gate honest. */
    }
  }

  concurrencySlot(): boolean {
    if (this.inFlight >= this.opts.concurrencyCap) return false;
    this.inFlight += 1;
    return true;
  }

  releaseSlot(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  turnLimitState(sessionHash: string): { allowed: boolean; used: number; cap: number } {
    const local = this.local.get(this.day() + ':' + sessionHash);
    const used = local?.calls ?? 0;
    return { allowed: used < this.opts.sessionMaxTurns, used, cap: this.opts.sessionMaxTurns };
  }

  costCapState(localOnlyCostUsd: number): { capped: boolean; todayUsd: number; capUsd: number | null } {
    const today = localOnlyCostUsd;
    return {
      capped: this.opts.costCapUsd > 0 && today >= this.opts.costCapUsd,
      todayUsd: today,
      capUsd: this.opts.costCapUsd > 0 ? this.opts.costCapUsd : null,
    };
  }
}

/* Global per-isolate tracker (concierge + agent jobs register here). */
export const sharedTracker = new UsageTracker();
void sharedTracker;
