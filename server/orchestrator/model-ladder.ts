/**
 * model-ladder.ts — cost/quality ladder for prompt-agent invocations.
 *
 * Principle (Brent directive): run every task as cheaply as it can be done,
 * escalate only when a task proves it needs more, stop at a hard ceiling.
 * Escalation is per-work-item and per-attempt across TWO provider families:
 *
 *   cheap (Pollinations paid, low-cost model)   ← base tier (replaces the old
 *     anonymous 'openai-fast' free tier: over-queued in practice — the 2026-10
 *     audit showed 50 items dying on identical 'non-JSON response' retries)
 *   → paid_tier1   (Pollinations, stronger model)
 *   → paid_tier2   (Pollinations, strongest model)
 *   → op_tier1     (OneProvider, cheap model)   ← second fallback gateway
 *   → op_tier2     (OneProvider, high tier)
 *   → free         (anonymous Pollinations — ONLY when no API key exists)
 *
 * Safety invariants:
 *  - No ladder call happens without the provider's API key configured
 *    (ladderEnabled()/opEnabled() gate on them). The anonymous 'free' tier is
 *    only reachable when no key is configured at all.
 *  - Every escalation is journaled as a 'model_escalation' event and the run
 *    records its tier + estimated cost in agent_runs (auditability).
 *  - Daily paid spend is capped (POLLINATIONS_DAILY_BUDGET_USD, default $2.00,
 *    shared across both providers) by a durable Postgres reservation ledger
 *    (budget-ledger.ts): cost is RESERVED conservatively before the provider
 *    call and reconciled after. When the cap is hit the ladder falls back to
 *    free tier for the rest of the UTC day — never hard-fail a tick. When
 *    budget ACCOUNTING itself is unavailable, paid escalation is REFUSED
 *    (fail-closed) and free runs.
 *  - OneProvider pricing is USD-native (per-token USD rates); Pollinations
 *    pricing stays Pollen-derived and converts via usdPerPollen().
 */

export type Tier = 'free' | 'cheap' | 'paid_tier1' | 'paid_tier2' | 'op_tier1' | 'op_tier2';

export type TierDef = {
  id: Tier;
  provider: string;
  model: string;
  /**
   * CONFIRMED Pollen-per-token rates from the live Pollinations model catalog
   * (https://gen.pollinations.ai/models — public, no auth). Pollen is
   * Pollinations' in-service credit; per-token rates are published per model.
   * USD figures are derived via usdPerPollen() — an estimate, not a bill (see
   * CostBasis in budget-ledger.ts). Only used by Pollinations tiers.
   */
  pollenPerPromptToken?: number;
  pollenPerCompletionToken?: number;
  /**
   * USD-native per-token rates (OneProvider tiers). When present, cost math
   * uses these directly instead of the Pollen conversion.
   */
  usdPerPromptToken?: number;
  usdPerCompletionToken?: number;
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
 * ESTIMATE, not a provider bill.
 */
export type CostBasis = 'provider_usage_derived_estimate' | 'conservative_reservation_estimate' | 'provider_billed_actual';

/**
 * USD-per-Pollen conversion used ONLY to express the budget ledger's USD caps
 * and cost figures for Pollinations tiers. Conservative face value default:
 * 1 Pollen = $1.00 (overestimate → reservations err toward LESS spend).
 * Override with POLLEN_USD_RATE once the account checkout price is known.
 */
export function usdPerPollen(): number {
  const v = Number(process.env.POLLEN_USD_RATE);
  return Number.isFinite(v) && v > 0 ? v : 1.0;
}

// Pollinations tiers (Pollen rates). paid_tier1/tier2 math is pinned by tests:
//   tier1: (8000 × 0.0000001 + 3000 × 0.0000005) Pollen × $1 = $0.0023
//   tier2: (8000 × 0.000002  + 3000 × 0.00001)  Pollen × $1 = $0.046
export const LADDER: Record<Exclude<Tier, 'free' | 'op_tier1' | 'op_tier2'>, TierDef> = {
  cheap: {
    id: 'cheap',
    provider: 'pollinations',
    // BASE tier: cheap-but-strong paid model (catalog: openai/gpt-5.4-nano,
    // ~$0.15 input / $0.94 output per 1M tokens via Pollen). Infinitely more
    // reliable than the over-queued anonymous tier; a fraction of tier1 cost.
    model: process.env.POLLINATIONS_MODEL_CHEAP || 'openai/gpt-5.4-nano',
    pollenPerPromptToken: 0.00000015,
    pollenPerCompletionToken: 0.0000009375,
    estOutputTokens: 2000,
    maxTokens: Number(process.env.POLLINATIONS_MAX_TOKENS_CHEAP || 3000),
    reservationInputTokens: 8000,
  },
  paid_tier1: {
    id: 'paid_tier1',
    provider: 'pollinations',
    // First escalation: GPT-6 Luna via Pollinations' paid platform.
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
    // Pollinations escalation ceiling: GPT-6 Sol.
    model: process.env.POLLINATIONS_MODEL_TIER2 || 'openai/gpt-6-sol',
    pollenPerPromptToken: 0.000002,
    pollenPerCompletionToken: 0.00001,
    estOutputTokens: 3000,
    maxTokens: Number(process.env.POLLINATIONS_MAX_TOKENS_TIER2 || 3000),
    reservationInputTokens: 8000,
  },
};

/** OneProvider (second fallback gateway) — USD-native pricing. */
export const ONEPROVIDER_LADDER: Record<'op_tier1' | 'op_tier2', TierDef> = {
  op_tier1: {
    id: 'op_tier1',
    provider: 'oneprovider',
    // OneProvider cheap tier (catalog ~$0.22 in / $0.66 out per 1M).
    model: process.env.ONEPROVIDER_MODEL_TIER1 || 'deepseek-v4-flash',
    usdPerPromptToken: 0.00000022,
    usdPerCompletionToken: 0.00000066,
    estOutputTokens: 2000,
    maxTokens: Number(process.env.ONEPROVIDER_MAX_TOKENS_TIER1 || 3000),
    reservationInputTokens: 8000,
  },
  op_tier2: {
    id: 'op_tier2',
    provider: 'oneprovider',
    // OneProvider high tier (catalog ~$0.40 in / $1.60 out per 1M).
    model: process.env.ONEPROVIDER_MODEL_TIER2 || 'qwen3.7-plus',
    usdPerPromptToken: 0.0000004,
    usdPerCompletionToken: 0.0000016,
    estOutputTokens: 3000,
    maxTokens: Number(process.env.ONEPROVIDER_MAX_TOKENS_TIER2 || 3000),
    reservationInputTokens: 8000,
  },
};

export const FREE_TIER: TierDef = {
  id: 'free',
  provider: 'pollinations',
  model: process.env.POLLINATIONS_MODEL || 'openai-fast',
  estOutputTokens: 2000,
  maxTokens: 0,
  reservationInputTokens: 0,
};

export function tierFor(t: string | null | undefined): TierDef {
  if (t === 'cheap') return LADDER.cheap;
  if (t === 'paid_tier1') return LADDER.paid_tier1;
  if (t === 'paid_tier2') return LADDER.paid_tier2;
  if (t === 'op_tier1') return ONEPROVIDER_LADDER.op_tier1;
  if (t === 'op_tier2') return ONEPROVIDER_LADDER.op_tier2;
  return FREE_TIER;
}

/** Next rung when a tier's provider is unavailable/broken (ladder degradation). */
export function nextTierFallback(t: Tier): Tier {
  switch (t) {
    case 'cheap': return 'paid_tier1';
    case 'paid_tier1': return 'op_tier1';
    case 'paid_tier2': return 'op_tier2';
    case 'op_tier1': return 'paid_tier2';
    case 'op_tier2': return 'free';
    default: return 'free';
  }
}

export function pollinationsKeyConfigured(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY);
}

export function opEnabled(): boolean {
  return Boolean(process.env.ONEPROVIDER_API_KEY);
}

/** Ladder active = any paid capability exists. */
export function ladderEnabled(): boolean {
  return pollinationsKeyConfigured() || opEnabled();
}

/** Attempt number (1-based) at which a role first escalates past cheap. */
export function escalateAfterAttempt(): number {
  const v = Number(process.env.POLLINATIONS_ESCALATE_AFTER_ATTEMPT);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 2;
}

/** Per-role hard ceilings: roles that must never run on paid models. */
const NEVER_PAID_ROLES = new Set<string>([]);

export function roleCanEscalate(role: string): boolean {
  return !NEVER_PAID_ROLES.has(role);
}

/**
 * Tier for an invocation, given the item's attempt number. Pure function.
 * attempt is 1-based (first try = 1). The policy (N = escalateAfterAttempt):
 *   - attempts 1..(N-1): cheap (Pollinations base)
 *   - attempt < N+3: paid_tier1
 *   - attempt < N+6: paid_tier2
 *   - attempt < N+9: op_tier1 (OneProvider)
 *   - beyond: op_tier2 — but never past the item's retry budget (maxAttempts):
 *     the item routes to human review at that point, so paid calls are waste.
 */
export function tierForAttempt(attempt: number, role: string, maxAttempts?: number | null): Tier {
  if (!ladderEnabled() || !roleCanEscalate(role)) return 'free';
  if (typeof maxAttempts === 'number' && maxAttempts > 0 && attempt > maxAttempts) return 'free';
  const N = escalateAfterAttempt();
  if (attempt < N) return 'cheap';
  if (attempt < N + 3) return 'paid_tier1';
  if (attempt < N + 6) return 'paid_tier2';
  if (attempt < N + 9) return 'op_tier1';
  return 'op_tier2';
}

/**
 * Cost estimate for a tier call, in USD. Defaults are CONSERVATIVE (maximum
 * plausible exposure: full reservation-input + tier max_tokens) because this
 * value is what the budget ledger reserves before the provider call.
 */
export function estimateCostUsd(t: Tier, estInputTokens?: number, maxOutputTokens?: number): number {
  const def = tierFor(t);
  const input = Math.max(estInputTokens ?? def.reservationInputTokens, 0);
  const output = Math.max(maxOutputTokens ?? def.maxTokens, 0);
  return input * tokenRateIn(def) + output * tokenRateOut(def);
}

/** Actual cost from provider usage numbers, in USD. */
export function actualCostUsd(t: Tier, promptTokens: number, completionTokens: number): number {
  const def = tierFor(t);
  return promptTokens * tokenRateIn(def) + completionTokens * tokenRateOut(def);
}

function tokenRateIn(def: TierDef): number {
  if (def.usdPerPromptToken !== undefined) return def.usdPerPromptToken;
  return (def.pollenPerPromptToken ?? 0) * usdPerPollen();
}
function tokenRateOut(def: TierDef): number {
  if (def.usdPerCompletionToken !== undefined) return def.usdPerCompletionToken;
  return (def.pollenPerCompletionToken ?? 0) * usdPerPollen();
}
function tierCostUsd(_def: TierDef, usd: number): number {
  return usd;
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
 * operator reconciliation against agent_runs.
 */
export function sumPaidSpendSql(): string {
  return `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
         COALESCE(SUM(cost_usd), 0)::float AS "paidCostUsd"
         FROM agent_runs
         WHERE (tier LIKE 'paid_%' OR tier LIKE 'op_tier\_%' ESCAPE '\' OR tier = 'cheap')
           AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`;
}
