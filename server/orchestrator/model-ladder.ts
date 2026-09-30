/**
 * model-ladder.ts — cost/quality ladder for prompt-agent invocations.
 *
 * Principle (Brent directive): run every task as cheaply as it can be done,
 * escalate only when a task proves it needs more, stop at a hard ceiling.
 * Escalation is per-work-item and per-attempt: free tier first; a role that
 * keeps failing at free tier earns paid help; budgets cap total exposure.
 *
 * Safety invariants:
 *  - No paid model is ever called unless PAID_LLM_API_KEY / PAID_LLM_URL are
 *    configured (ladderEnabled() gates on BOTH).
 *  - free tier is always attempted first; escalation requires repeated
 *    failures (escalateAfterAttempt(), default 3).
 *  - Every escalation is journaled as a 'model_escalation' event and the run
 *    records its tier + estimated cost in agent_runs (auditability).
 *  - Daily paid spend is capped (PAID_LLM_DAILY_BUDGET_USD, default $2.00) by
 *    a durable Postgres reservation ledger (budget-ledger.ts): cost is
 *    RESERVED conservatively before the provider call and reconciled after.
 *    When the cap is hit the ladder falls back to free tier for the rest of
 *    the UTC day — never hard-fail a tick. When budget ACCOUNTING itself is
 *    unavailable, paid escalation is REFUSED (fail-closed) and free runs.
 */

export type Tier = 'free' | 'paid_tier1' | 'paid_tier2';

export type TierDef = {
  id: Tier;
  provider: string;
  model: string;
  /**
   * Blended $/1M tokens (in+out) for conservative cost ESTIMATION. This is an
   * estimate, not provider-billed actual — see CostBasis in budget-ledger.ts.
   */
  usdPerMTokens: number;
  /** Typical output tokens — used only for retrospective estimates. */
  estOutputTokens: number;
  /** max_tokens sent on paid provider calls (hard output-exposure ceiling). */
  maxTokens: number;
  /** Conservative input-token assumption for pre-flight budget reservation. */
  reservationInputTokens: number;
};

/** How a recorded cost number should be interpreted. */
export type CostBasis = 'provider_reported_actual' | 'conservative_estimate';

/** Cheap→good ladder. Edit PRICES/MODELS here as the market moves. */
export const LADDER: Record<Exclude<Tier, 'free'>, TierDef> = {
  paid_tier1: {
    id: 'paid_tier1',
    provider: 'paid-openai-compatible',
    // Cheap-but-strong default: DeepSeek V3 via any OpenAI-compatible router.
    model: process.env.PAID_LLM_MODEL_TIER1 || 'deepseek-chat',
    usdPerMTokens: 0.5,
    estOutputTokens: 2000,
    maxTokens: Number(process.env.PAID_LLM_MAX_TOKENS_TIER1 || 3000),
    reservationInputTokens: 8000,
  },
  paid_tier2: {
    id: 'paid_tier2',
    provider: 'paid-openai-compatible',
    // Escalation ceiling: frontier model for the hardest roles/refusals.
    model: process.env.PAID_LLM_MODEL_TIER2 || 'gpt-4o-mini',
    usdPerMTokens: 1.5,
    estOutputTokens: 3000,
    maxTokens: Number(process.env.PAID_LLM_MAX_TOKENS_TIER2 || 3000),
    reservationInputTokens: 8000,
  },
};

export const FREE_TIER: TierDef = {
  id: 'free',
  provider: 'pollinations',
  model: process.env.POLLINATIONS_MODEL || 'openai-fast',
  usdPerMTokens: 0,
  estOutputTokens: 2000,
  maxTokens: 0,
  reservationInputTokens: 0,
};

export function tierFor(t: string | null | undefined): TierDef {
  if (t === 'paid_tier1') return LADDER.paid_tier1;
  if (t === 'paid_tier2') return LADDER.paid_tier2;
  return FREE_TIER;
}

export function ladderEnabled(): boolean {
  return Boolean(process.env.PAID_LLM_API_KEY && process.env.PAID_LLM_URL);
}

/** Attempt number (1-based) at which a role first earns paid_tier1. Read dynamically so env overrides take effect per-call. */
export function escalateAfterAttempt(): number {
  const v = Number(process.env.ESCALATE_AFTER_ATTEMPT);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 3;
}

/** Per-role hard ceilings: roles that must never run on paid models (safety-sensitive or cheap enough at free). */
const NEVER_PAID_ROLES = new Set<string>([]);

export function roleCanEscalate(role: string): boolean {
  return !NEVER_PAID_ROLES.has(role);
}

/**
 * Tier for an invocation, given the item's attempt number and the tier that
 * just failed. Pure function — trivially testable policy.
 *
 * attempt is 1-based (first try = 1). The policy:
 *   - attempts 1..(N-1): free
 *   - attempt >= N: paid_tier1
 *   - attempt >= N+3 (tier1 also failed 3 times): paid_tier2
 */
export function tierForAttempt(attempt: number, role: string): Tier {
  if (!ladderEnabled() || !roleCanEscalate(role)) return 'free';
  const N = escalateAfterAttempt();
  if (attempt < N) return 'free';
  if (attempt < N + 3) return 'paid_tier1';
  return 'paid_tier2';
}

/**
 * Cost estimate for a tier call, in USD. Defaults are CONSERVATIVE (maximum
 * plausible exposure: full reservation-input + tier max_tokens output) because
 * this value is what the budget ledger reserves before the provider call.
 * When usage is reported after the call, the actual replaces the estimate.
 */
export function estimateCostUsd(t: Tier, estInputTokens?: number, maxOutputTokens?: number): number {
  const def = tierFor(t);
  const input = Math.max(estInputTokens ?? def.reservationInputTokens, 0);
  const output = Math.max(maxOutputTokens ?? def.maxTokens, 0);
  return ((input + output) * def.usdPerMTokens) / 1_000_000;
}

/** Actual/actualized cost from provider usage numbers, in USD. */
export function actualCostUsd(t: Tier, promptTokens: number, completionTokens: number): number {
  const def = tierFor(t);
  return ((promptTokens + completionTokens) * def.usdPerMTokens) / 1_000_000;
}

// ── Daily budget guard ───────────────────────────────────────────────────────

export function dailyBudgetUsd(): number {
  const v = Number(process.env.PAID_LLM_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 2.0;
}

export type SpendSummary = { day: string; paidCostUsd: number };

/** UTC day key for budget windows. */
export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function budgetRemainingUsd(spend: SpendSummary | null | undefined, now = new Date()): number {
  const today = utcDay(now);
  const used = spend && spend.day === today ? Math.max(0, Number(spend.paidCostUsd) || 0) : 0;
  return Math.max(0, dailyBudgetUsd() - used);
}

/** True when a paid call must be refused for budget reasons. */
export function budgetExhausted(spend: SpendSummary | null | undefined, nextEstimateUsd: number, now = new Date()): boolean {
  return budgetRemainingUsd(spend, now) < nextEstimateUsd;
}

/**
 * AUDIT ONLY — not used for budget enforcement. Authorization flows through
 * the atomic reservation ledger (budget-ledger.ts); this aggregate exists for
 * operator reconciliation against agent_runs. agent_runs.cost_usd holds
 * actual-or-conservative-estimated cost per run (see docs/RUNTIME.md).
 */
export function sumPaidSpendSql(): string {
  return `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
         COALESCE(SUM(cost_usd), 0)::float AS "paidCostUsd"
         FROM agent_runs
         WHERE tier LIKE 'paid_%'
           AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`;
}
