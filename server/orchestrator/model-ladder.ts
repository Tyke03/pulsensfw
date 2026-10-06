/**
 * model-ladder.ts — cost/quality ladder for prompt-agent invocations.
 *
 * Principle (Brent directive): run every task as cheaply as it can be done,
 * escalate only when a task proves it needs more, stop at a hard ceiling.
 * Escalation is per-work-item and per-attempt: free tier first; a role that
 * keeps failing at free tier earns paid help; budgets cap total exposure.
 *
 * Safety invariants:
 *  - No paid model is ever called unless POLLINATIONS_API_KEY is configured
 *    (ladderEnabled() gates on it). Paid escalation runs on Pollinations' own
 *    paid platform (gen.pollinations.ai) — the SAME provider/account path as
 *    the free tier; no third-party router is involved.
 *  - free tier is always attempted first; escalation requires repeated
 *    failures (escalateAfterAttempt(), default 3).
 *  - Every escalation is journaled as a 'model_escalation' event and the run
 *    records its tier + estimated cost in agent_runs (auditability).
 *  - Daily paid spend is capped (POLLINATIONS_DAILY_BUDGET_USD, default $2.00) by
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
   * CONFIRMED Pollen-per-token rates from the live Pollinations model catalog
   * (https://gen.pollinations.ai/models — public, no auth). Pollen is
   * Pollinations' in-service credit; per-token rates are published per model.
   * USD figures are derived via usdPerPollen() — an estimate, not a bill (see
   * CostBasis in budget-ledger.ts).
   */
  pollenPerPromptToken: number;
  pollenPerCompletionToken: number;
  /** Typical output tokens — used only for retrospective estimates. */
  estOutputTokens: number;
  /** max_tokens sent on paid provider calls (hard output-exposure ceiling). */
  maxTokens: number;
  /** Conservative input-token assumption for pre-flight budget reservation. */
  reservationInputTokens: number;
};

/**
 * How a recorded cost number was derived. Labels state the EVIDENCE, never
 * overstate it: token usage × locally configured blended rates is a DERIVED
 * ESTIMATE, not a provider bill; only a provider-returned billed-cost field
 * consumed verbatim qualifies as provider_billed_actual (no code path produces
 * it yet — reserved for forward compatibility).
 */
export type CostBasis = 'provider_usage_derived_estimate' | 'conservative_reservation_estimate' | 'provider_billed_actual';

/**
 * USD-per-Pollen conversion used ONLY to express the budget ledger's USD caps
 * and cost figures. Pollen's cash price is shown at checkout (Stripe, USD) and
 * is not published in docs, so the default is the CONSERVATIVE face value
 * 1 Pollen = $1.00 — an overestimate of any realistic purchase rate, which
 * makes reservations and caps err toward LESS paid spend (fail-closed
 * direction). Override with POLLEN_USD_RATE once the account checkout price
 * is known. Model-catalog Pollen rates themselves are confirmed live.
 */
export function usdPerPollen(): number {
  const v = Number(process.env.POLLEN_USD_RATE);
  return Number.isFinite(v) && v > 0 ? v : 1.0;
}

/** Cheap→good ladder. Edit POLLEN RATES/MODELS here as the catalog moves. */
export const LADDER: Record<Exclude<Tier, 'free'>, TierDef> = {
  paid_tier1: {
    id: 'paid_tier1',
    provider: 'pollinations',
    // Cheap-but-strong escalation: GPT-6 Luna via Pollinations' paid platform.
    // Confirmed live (gen.pollinations.ai/models): reasoning + tools +
    // response_format, 1M ctx, regular model (draws Quest Pollen before Paid).
    model: process.env.POLLINATIONS_MODEL_TIER1 || 'openai/gpt-6-luna',
    pollenPerPromptToken: 0.0000001,
    pollenPerCompletionToken: 0.0000005,
    estOutputTokens: 2000,
    maxTokens: Number(process.env.POLLINATIONS_MAX_TOKENS_TIER1 || 3000),
    reservationInputTokens: 8000,
  },
  paid_tier2: {
    id: 'paid_tier2',
    provider: 'pollinations',
    // Escalation ceiling for the hardest roles/refusals: GPT-6 Sol.
    // Confirmed live: reasoning + tools + response_format, 1M ctx, regular
    // model (Quest Pollen first).
    model: process.env.POLLINATIONS_MODEL_TIER2 || 'openai/gpt-6-sol',
    pollenPerPromptToken: 0.000002,
    pollenPerCompletionToken: 0.00001,
    estOutputTokens: 3000,
    maxTokens: Number(process.env.POLLINATIONS_MAX_TOKENS_TIER2 || 3000),
    reservationInputTokens: 8000,
  },
};

export const FREE_TIER: TierDef = {
  id: 'free',
  provider: 'pollinations',
  model: process.env.POLLINATIONS_MODEL || 'openai-fast',
  pollenPerPromptToken: 0,
  pollenPerCompletionToken: 0,
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
  return Boolean(process.env.POLLINATIONS_API_KEY);
}

/** Attempt number (1-based) at which a role first earns paid_tier1. Read dynamically so env overrides take effect per-call. */
export function escalateAfterAttempt(): number {
  const v = Number(process.env.POLLINATIONS_ESCALATE_AFTER_ATTEMPT);
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
 *   - attempt > maxAttempts (retry budget exhausted): free — the item is routed
 *     to human review at that point, so paid calls would be pure waste. This
 *     also caps the blast radius of any stuck item that keeps being re-claimed.
 */
export function tierForAttempt(attempt: number, role: string, maxAttempts?: number | null): Tier {
  if (!ladderEnabled() || !roleCanEscalate(role)) return 'free';
  const N = escalateAfterAttempt();
  if (attempt < N) return 'free';
  if (typeof maxAttempts === 'number' && maxAttempts > 0 && attempt > maxAttempts) return 'free';
  if (attempt < N + 3) return 'paid_tier1';
  return 'paid_tier2';
}

/**
 * Cost estimate for a tier call, in USD. Defaults are CONSERVATIVE (maximum
 * plausible exposure: full reservation-input + tier max_tokens output) because
 * this value is what the budget ledger reserves before the provider call.
 * When usage is reported after the call, the actual replaces the estimate.
 * Pollen rates come from the live Pollinations catalog; the Pollen→USD
 * conversion is usdPerPollen() (conservative default 1.0).
 */
export function estimateCostUsd(t: Tier, estInputTokens?: number, maxOutputTokens?: number): number {
  const def = tierFor(t);
  const input = Math.max(estInputTokens ?? def.reservationInputTokens, 0);
  const output = Math.max(maxOutputTokens ?? def.maxTokens, 0);
  return pollenToUsd(input * def.pollenPerPromptToken + output * def.pollenPerCompletionToken);
}

/** Actual/actualized cost from provider usage numbers, in USD. */
export function actualCostUsd(t: Tier, promptTokens: number, completionTokens: number): number {
  const def = tierFor(t);
  return pollenToUsd(promptTokens * def.pollenPerPromptToken + completionTokens * def.pollenPerCompletionToken);
}

function pollenToUsd(pollen: number): number {
  return (pollen * usdPerPollen());
}

// ── Daily budget guard ───────────────────────────────────────────────────────

export function dailyBudgetUsd(): number {
  const v = Number(process.env.POLLINATIONS_DAILY_BUDGET_USD);
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
 * Operator-visible budget alert level for a day, from what remains of the cap.
 * Pure function; the ledger logs the warning at reservation time so operators
 * see the approach to the cap in Render logs before it is hit.
 */
export type BudgetAlertLevel = 'none' | 'warn_50' | 'warn_90';
export function budgetAlertLevel(remainingUsd: number, budgetUsd: number): BudgetAlertLevel {
  if (!(budgetUsd > 0)) return 'none';
  const remaining = Math.max(0, remainingUsd);
  if (remaining <= budgetUsd * 0.1) return 'warn_90';
  if (remaining <= budgetUsd * 0.5) return 'warn_50';
  return 'none';
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
