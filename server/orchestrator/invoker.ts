/**
 * invoker.ts — pluggable prompt-agent invocation layer.
 * - EchoInvoker: deterministic fixture-backed stub for tests + shadow mode (no network).
 * - PollinationsInvoker: anonymous free tier (fallback only — never the base
 *   rung anymore; the anonymous tier proved over-queued: 50 items died on
 *   'non-JSON response' retries in 2026-10).
 * - PollinationsPaidInvoker: gen.pollinations.ai paid platform — serves the
 *   cheap/paid_tier1/paid_tier2 rungs (model comes from the tier def).
 * - OneproviderInvoker: api.oneprovider.dev (OpenAI-compatible) — serves the
 *   op_tier1/op_tier2 rungs. The SECOND fallback gateway.
 * - LadderInvoker: ledger-authorized routing across both provider families,
 *   with a per-tier circuit breaker so a broken rung degrades downward
 *   instead of burning identical retries.
 * The orchestrator validates every response against the agent's output schema
 * (see packages.ts) before acceptance.
 */
import crypto from 'node:crypto';
import {
  type Tier,
  type TierDef,
  tierFor,
  ladderEnabled,
  pollinationsKeyConfigured,
  opEnabled,
  nextTierFallback,
  estimateCostUsd,
  actualCostUsd,
} from './model-ladder';
import {
  type LedgerDb,
  type CostBasis,
  reserveForCall,
  settleReservation,
  releaseReservation,
  markReconciliationNeeded,
  sweepStaleReservations,
} from './budget-ledger';

export type InvokeMeta = {
  role: string;
  promptId: string;
  promptVersion: string;
  mode: 'production' | 'shadow' | 'dry_run';
  /** Requested ladder tier (default free). Set by engine per attempt. */
  tier?: Tier;
  /** 1-based attempt number, for logging/telemetry. */
  attempt?: number;
  /** Owning work item, for budget-reservation audit rows. */
  workItemId?: number | null;
};

export type InvokeResult = {
  ok: boolean;
  output?: unknown;
  raw?: string;
  error?: string;
  model?: string;
  provider?: string;
  durationMs: number;
  /** Ladder tier the call actually ran at. */
  tier?: Tier;
  /** Actual (provider-reported) or conservative-estimated USD cost. 0 for free tier. */
  costUsd?: number;
  /** How costUsd was derived — never assume billed actual without usage. */
  costBasis?: CostBasis;
  usage?: { promptTokens: number; completionTokens: number };
  /** True when a requested paid tier was refused for budget (cap reached) and free was used. */
  budgetFallback?: boolean;
  /**
   * True when budget ACCOUNTING was unavailable and paid escalation was
   * refused (fail-closed) — free ran instead. Distinct from budgetFallback.
   */
  accountingFallback?: boolean;
  /** Structured transport/protocol failure class (paid invoker). */
  errorKind?: 'timeout' | 'network' | 'protocol' | 'http' | 'unconfigured' | 'unknown';
  /** True when the requested tier's circuit breaker was open and a lower rung served the call. */
  breakerOpenFallback?: boolean;
  /** The tier actually served after any breaker/budget downgrades. */
  servedTier?: Tier;
  /** Budget reservation outcome for this paid call (audit trail). */
  reservation?: { id: string; state: string };
};

export type AgentInvoker = {
  invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult>;
};

export function hashInput(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input ?? null)).digest('hex');
}

/** Extract a usable JSON object from model content: strict parse, then
 * fenced/prose-wrapped, then balanced-brace repair for truncated output. */
function extractJsonObject(content: string): unknown | undefined {
  try { return JSON.parse(content); } catch { /* next */ }
  const m = content.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* next */ } }
  // Truncated stream: find the object start and close unbalanced braces.
  const start = content.indexOf('{');
  if (start >= 0) {
    const cut = content.slice(start);
    let depth = 0, inStr = false, esc = false;
    for (let i = 0; i < cut.length; i++) {
      const c = cut[i];
      if (esc) { esc = false; continue; }
      if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      // Stop at the first top-level close.
      if (depth === 0 && c === '}') {
        try { return JSON.parse(cut.slice(0, i + 1)); } catch { return undefined; }
      }
    }
  }
  return undefined;
}

// ── EchoInvoker (tests/shadow) ───────────────────────────────────────────────

export class EchoInvoker implements AgentInvoker {
  constructor(private fixtures: Map<string, unknown>) {}
  setFixture(role: string, output: unknown) { this.fixtures.set(role, output); }
  async invoke(workPacket: unknown, _systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const fixture = this.fixtures.get(meta.role);
    if (!fixture) {
      return { ok: false, error: `no fixture for role ${meta.role}`, provider: 'echo', model: 'echo', durationMs: 0 };
    }
    void workPacket;
    return {
      ok: true, output: typeof fixture === 'function' ? (fixture as any)(workPacket, meta) : fixture,
      provider: 'echo', model: 'echo', durationMs: 0,
    };
  }
}

// ── Pollinations anonymous (fallback free tier) ──────────────────────────────

/**
 * Pollinations text-API invoker (OpenAI-compatible endpoint). Anonymous tier
 * works without a key; used ONLY as the ladder's bottom fallback now.
 * NOTE: system prompt contains no secrets; work packet contains no credentials.
 *
 * Transport strategy:
 *  1. POST /openai (OpenAI-compatible) — preferred.
 *  2. On failure, GET /{prompt}?model=…&json=true — the legacy anonymous GET
 *     path. Both send the same content; no secrets in either.
 */
export class PollinationsInvoker implements AgentInvoker {
  constructor(
    private endpoint = process.env.POLLINATIONS_ENDPOINT || 'https://text.pollinations.ai/openai',
    private model = process.env.POLLINATIONS_MODEL || 'openai-fast',
  ) {}

  private parseContent(content: string, start: number, model: string): InvokeResult {
    const parsed = extractJsonObject(content);
    if (parsed === undefined) {
      return { ok: false, error: 'non-JSON response', raw: content.slice(0, 500), provider: 'pollinations', model, durationMs: Date.now() - start };
    }
    return { ok: true, output: parsed, provider: 'pollinations', model, durationMs: Date.now() - start };
  }

  /** Legacy anonymous GET path: system+packet composed into the prompt. */
  private async invokeGet(workPacket: unknown, systemPrompt: string, model: string, start: number): Promise<InvokeResult> {
    const prompt = `${systemPrompt}

WORK PACKET (respond with JSON only, exactly the envelope shape):
${JSON.stringify(workPacket)}`;
    const url = `${this.endpoint.replace('/openai', '')}/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&json=true&private=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) return { ok: false, error: `pollinations GET HTTP ${res.status}`, provider: 'pollinations', model, durationMs: Date.now() - start };
      const text = await res.text();
      return this.parseContent(text, start, model);
    } catch (err: any) {
      return { ok: false, error: err?.message || 'GET invoker failure', provider: 'pollinations', model, durationMs: Date.now() - start };
    }
  }

  async invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const start = Date.now();
    const model = meta.tier === 'free' ? (tierFor('free').model) : this.model;
    // Explicit JSON envelope skeleton in the prompt (small models need it).
    const userContent = `${JSON.stringify(workPacket)}\n\nReturn ONLY a JSON object exactly in this envelope:\n{"status":"ok"|"refused"|"escalate","confidence":0.0,"uncertainty":[],"escalation":{"reason_code":"…","detail":"…","recommended_action":"…"}|null,"payload":{…}}`;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.POLLINATIONS_TOKEN) headers.Authorization = `Bearer ${process.env.POLLINATIONS_TOKEN}`;
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          private: true,
        }),
      });
      if (!res.ok) {
        const get = await this.invokeGet(workPacket, systemPrompt, model, start);
        if (get.ok) return get;
        return { ok: false, error: `pollinations HTTP ${res.status}`, errorKind: 'http', provider: 'pollinations', model, durationMs: Date.now() - start };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return this.parseContent(content, start, model);
    } catch (err: any) {
      return { ok: false, error: err?.message || 'invoker failure', errorKind: 'network', provider: 'pollinations', model, durationMs: Date.now() - start };
    }
  }
}

// ── Shared OpenAI-compatible paid-client core ────────────────────────────────

function classifyTransport(err: any): InvokeResult['errorKind'] {
  const name = String(err?.name ?? '');
  const code = String(err?.code ?? err?.cause?.code ?? '');
  if (name === 'TimeoutError' || name === 'AbortError' || code === 'ABORT_ERR') return 'timeout';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'network';
  if (name === 'TypeError') return 'network'; // undici fetch failures surface as TypeError
  return 'unknown';
}

/**
 * One generic OpenAI-compatible paid client. Contrary-HTTP-status responses
 * never log provider bodies (may echo account details). Successful bodies are
 * parsed with the full repair ladder (strict → fenced → brace-balanced).
 */
export class OpenAICompatiblePaidInvoker implements AgentInvoker {
  constructor(
    private opts: {
      endpoint: string;
      apiKeyEnv: string;
      provider: string;
      /** Which tiers this client serves. */
      serves: Tier[];
      timeoutMs: number;
      /** Extra body params (e.g. private=true). */
      extraBody?: Record<string, unknown>;
    },
  ) {}

  /** True when a non-2xx status is a config/billing problem (fail fast, don't retry). */
  static fatalHttp(status: number): boolean {
    return status === 400 || status === 401 || status === 402 || status === 403 || status === 404;
  }

  async invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const start = Date.now();
    const tier = (meta.tier ?? 'cheap') as Tier;
    if (!this.opts.serves.includes(tier)) {
      return { ok: false, error: `tier ${tier} not served by ${this.opts.provider}`, errorKind: 'unconfigured', provider: this.opts.provider, durationMs: Date.now() - start };
    }
    const apiKey = process.env[this.opts.apiKeyEnv];
    if (!apiKey) {
      return { ok: false, error: `paid invoker not configured (${this.opts.apiKeyEnv})`, errorKind: 'unconfigured', provider: this.opts.provider, durationMs: Date.now() - start };
    }
    const tierDef = tierFor(tier);
    const model = tierDef.model;
    const userContent = `${JSON.stringify(workPacket)}\n\nReturn ONLY a JSON object exactly in this envelope:\n{"status":"ok"|"refused"|"escalate","confidence":0.0,"uncertainty":[],"escalation":{"reason_code":"…","detail":"…","recommended_action":"…"}|null,"payload":{…}}`;
    try {
      const res = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(this.opts.timeoutMs),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: tierDef.maxTokens,
          response_format: { type: 'json_object' },
          ...(this.opts.extraBody ?? {}),
        }),
      });
      if (!res.ok) {
        // Status code only — never persist or log the response body (may echo
        // account details), and never include headers here.
        return {
          ok: false, error: `${this.opts.provider} HTTP ${res.status}`, errorKind: 'http',
          provider: this.opts.provider, model, tier, durationMs: Date.now() - start,
        };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage ? {
        promptTokens: Number(data.usage.prompt_tokens) || 0,
        completionTokens: Number(data.usage.completion_tokens) || 0,
      } : undefined;
      const costUsd = usage ? actualCostUsd(tier, usage.promptTokens, usage.completionTokens) : undefined;
      const costBasis: CostBasis = usage ? 'provider_usage_derived_estimate' : 'conservative_reservation_estimate';
      const finalCost = costUsd ?? estimateCostUsd(tier);
      const parsed = extractJsonObject(content);
      if (parsed === undefined) {
        // 200 with an unusable body still consumed tokens → record cost, classify protocol.
        return {
          ok: false, error: 'non-JSON response', errorKind: 'protocol', provider: this.opts.provider,
          model, tier, costUsd: finalCost, costBasis, usage, durationMs: Date.now() - start,
          raw: content.slice(0, 500),
        };
      }
      return { ok: true, output: parsed, provider: this.opts.provider, model, tier, costUsd: finalCost, costBasis, usage, durationMs: Date.now() - start };
    } catch (err: any) {
      const errorKind = classifyTransport(err);
      const safeMsg = errorKind === 'timeout' ? `${this.opts.provider} request timed out after ${this.opts.timeoutMs}ms`
        : errorKind === 'network' ? `${this.opts.provider} request network failure`
        : `${this.opts.provider} invoker failure`;
      return { ok: false, error: safeMsg, errorKind, provider: this.opts.provider, model, tier, durationMs: Date.now() - start };
    }
  }
}

/** Pollinations paid platform: serves cheap / paid_tier1 / paid_tier2. */
export class PollinationsPaidInvoker extends OpenAICompatiblePaidInvoker {
  constructor(
    endpoint = process.env.POLLINATIONS_PAID_ENDPOINT || 'https://gen.pollinations.ai/v1/chat/completions',
    /** Legacy positional apiKey arg — retained for call-site compat; the
     * authoritative key is read from POLLINATIONS_API_KEY at invoke time. */
    _legacyApiKey?: string,
    timeoutMs = Number(process.env.POLLINATIONS_TIMEOUT_MS) > 0 ? Number(process.env.POLLINATIONS_TIMEOUT_MS) : 30_000,
  ) {
    super({ endpoint, apiKeyEnv: 'POLLINATIONS_API_KEY', provider: 'pollinations', serves: ['cheap', 'paid_tier1', 'paid_tier2'], timeoutMs, extraBody: { private: true } });
  }
}

/** OneProvider: the second fallback gateway (op_tier1, op_tier2). */
export class OneproviderInvoker extends OpenAICompatiblePaidInvoker {
  constructor(
    endpoint = process.env.ONEPROVIDER_ENDPOINT || 'https://api.oneprovider.dev/v1/chat/completions',
    timeoutMs = Number(process.env.ONEPROVIDER_TIMEOUT_MS) > 0 ? Number(process.env.ONEPROVIDER_TIMEOUT_MS) : 30_000,
  ) {
    super({ endpoint, apiKeyEnv: 'ONEPROVIDER_API_KEY', provider: 'oneprovider', serves: ['op_tier1', 'op_tier2'], timeoutMs });
  }
}

// ── LadderInvoker ────────────────────────────────────────────────────────────

/**
 * Per-tier circuit breaker (in-memory, per-instance — orchestrator ticks run
 * in one process). N consecutive non-retryable-ish failures (protocol/fatal
 * http/unconfigured) on a tier open the breaker for a cooldown; requests to an
 * open tier degrade to the next rung instead of repeating identical failures.
 */
class TierBreaker {
  private state = new Map<Tier, { fails: number; openUntil: number; lastFailAt: number }>();
  constructor(
    private threshold = Number(process.env.LADDER_BREAKER_THRESHOLD || 3),
    private cooldownMs = Number(process.env.LADDER_BREAKER_COOLDOWN_MS || 5 * 60_000),
    private windowMs = Number(process.env.LADDER_BREAKER_WINDOW_MS || 10 * 60_000),
  ) {}

  openFor(tier: Tier): boolean {
    const s = this.state.get(tier);
    if (!s) return false;
    return s.openUntil > Date.now();
  }

  recordFailure(tier: Tier, kind: InvokeResult['errorKind']): void {
    const now = Date.now();
    const s = this.state.get(tier) ?? { fails: 0, openUntil: 0, lastFailAt: 0 };
    // Only structural failures (same request → same result) count toward the
    // breaker. Timeouts/network stay ordinary-retryable.
    const structural = kind === 'protocol' || kind === 'http' || kind === 'unconfigured';
    if (!structural) { this.state.set(tier, s); return; }
    const fails = now - s.lastFailAt <= this.windowMs ? s.fails + 1 : 1;
    s.fails = fails;
    s.lastFailAt = now;
    if (fails >= this.threshold) {
      s.openUntil = now + this.cooldownMs;
      s.fails = 0;
    }
    this.state.set(tier, s);
  }

  recordSuccess(tier: Tier): void {
    this.state.delete(tier);
  }
}

/**
 * LadderInvoker — routes each call to the tier the engine requested, across
 * BOTH provider families (Pollinations paid + OneProvider), with DURABLE
 * budget enforcement: cost is reserved atomically in the Postgres ledger
 * BEFORE the paid call and reconciled after. Fail-closed: if budget
 * accounting is unavailable, paid escalation is refused and free/accounting
 * fallback runs. Never throws.
 *
 * Degradation paths (checked in order):
 *   1. requested tier's circuit breaker open → next rung (or free).
 *   2. requested provider has no key configured → next rung (or free).
 *   3. daily budget cap reached → free (budgetFallback).
 *   4. budget accounting unavailable → free (accountingFallback, fail-closed).
 */
export class LadderInvoker implements AgentInvoker {
  private breaker = new TierBreaker();

  constructor(
    private free: AgentInvoker,
    private pollinationsPaid: AgentInvoker | null,
    private oneprovider: AgentInvoker | null,
    private db: LedgerDb,
  ) {}

  private async runFree(workPacket: unknown, systemPrompt: string, meta: InvokeMeta, extra: Partial<InvokeResult>): Promise<InvokeResult> {
    const r = await this.free.invoke(workPacket, systemPrompt, { ...meta, tier: 'free' });
    return { ...r, tier: 'free' as Tier, servedTier: 'free' as Tier, costUsd: 0, ...extra };
  }

  private invokerFor(tier: Tier): AgentInvoker | null {
    if (tier === 'cheap' || tier === 'paid_tier1' || tier === 'paid_tier2') return this.pollinationsPaid;
    if (tier === 'op_tier1' || tier === 'op_tier2') return this.oneprovider;
    return null;
  }

  /** Degrade a tier to something actually servable. Returns null → free. */
  private servableTier(requested: Tier): Tier | null {
    let t: Tier = requested;
    for (let i = 0; i < 5; i++) {
      if (this.breaker.openFor(t)) { t = nextTierFallback(t); continue; }
      if (t === 'cheap') { if (pollinationsKeyConfigured() && this.pollinationsPaid) return t; t = nextTierFallback(t); continue; }
      if (t === 'paid_tier1' || t === 'paid_tier2') { if (pollinationsKeyConfigured() && this.pollinationsPaid) return t; t = nextTierFallback(t); continue; }
      if (t === 'op_tier1' || t === 'op_tier2') { if (opEnabled() && this.oneprovider) return t; t = nextTierFallback(t); continue; }
      return null; // 'free' handled by runFree
    }
    return null;
  }

  async invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const requested = (meta.tier ?? 'free') as Tier;
    if (requested === 'free' || !ladderEnabled()) {
      return this.runFree(workPacket, systemPrompt, meta, {});
    }

    const tier = this.servableTier(requested);
    if (tier === null) {
      return this.runFree(workPacket, systemPrompt, meta, this.breaker.openFor(requested) ? { breakerOpenFallback: true } : {});
    }
    const invoker = this.invokerFor(tier);
    if (!invoker) return this.runFree(workPacket, systemPrompt, meta, {});

    // Sweep dead-process reservations BEFORE authorizing a new one. A sweep
    // failure is an accounting outage: fail closed.
    let swept: number;
    try {
      swept = await sweepStaleReservations(this.db);
    } catch {
      swept = -1;
    }
    if (swept < 0) {
      return this.runFree(workPacket, systemPrompt, meta, { accountingFallback: true, breakerOpenFallback: this.breaker.openFor(requested) ? true : undefined });
    }

    const res = await reserveForCall(this.db, {
      tier,
      workItemId: meta.workItemId ?? null,
      role: meta.role,
      model: tierFor(tier).model,
    });
    if (!res.granted) {
      if (res.reason === 'cap_reached') {
        return this.runFree(workPacket, systemPrompt, meta, { budgetFallback: true, breakerOpenFallback: this.breaker.openFor(requested) ? true : undefined });
      }
      return this.runFree(workPacket, systemPrompt, meta, { accountingFallback: true, breakerOpenFallback: this.breaker.openFor(requested) ? true : undefined });
    }

    const servedMeta: InvokeMeta = { ...meta, tier };
    const r = await invoker.invoke(workPacket, systemPrompt, servedMeta);
    r.servedTier = tier;
    if (requested !== tier) r.breakerOpenFallback = true;
    // Conservative estimate = maximum plausible exposure (ledger-sized).
    const est = estimateCostUsd(tier);
    const basis: CostBasis = r.costBasis ?? (r.usage ? 'provider_usage_derived_estimate' : 'conservative_reservation_estimate');
    const cost = r.costUsd ?? est;

    if (r.ok) {
      this.breaker.recordSuccess(tier);
      const st = await settleReservation(this.db, res.reservationId, cost, basis);
      r.costUsd = cost;
      r.costBasis = basis;
      r.reservation = { id: res.reservationId, state: st.ok ? 'settled' : 'reserved' };
      return r;
    }
    this.breaker.recordFailure(tier, r.errorKind);
    switch (r.errorKind) {
      case 'http': {
        // Status-code-only failure: no generation was billed → release.
        const rel = await releaseReservation(this.db, res.reservationId);
        r.reservation = { id: res.reservationId, state: rel.ok ? 'released' : 'reserved' };
        break;
      }
      case 'protocol': {
        // 200 with an unusable body: tokens were consumed → retain estimate.
        const st = await settleReservation(this.db, res.reservationId, est, 'conservative_reservation_estimate');
        r.costUsd = est;
        r.costBasis = 'conservative_reservation_estimate';
        r.reservation = { id: res.reservationId, state: st.ok ? 'settled' : 'reserved' };
        break;
      }
      case 'timeout':
      case 'network':
      case 'unknown':
      default: {
        // AMBIGUOUS completion: the request may have reached the provider.
        // Retain the conservative reservation as an auditable
        // reconciliation-needed row — never risk undercounting billed spend.
        const mr = await markReconciliationNeeded(this.db, res.reservationId);
        r.reservation = { id: res.reservationId, state: mr.ok ? 'reconciliation_needed' : 'reserved' };
        break;
      }
    }
    return r;
  }
}
