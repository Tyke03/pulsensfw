/**
 * invoker.ts — pluggable prompt-agent invocation layer.
 * - EchoInvoker: deterministic fixture-backed stub for tests + shadow mode (no network).
 * - PollinationsInvoker: OpenAI-compatible chat call; prompt package system prompt,
 *   JSON work packet as user message; never sends secrets.
 * The orchestrator validates every response against the agent's output schema
 * (see packages.ts) before acceptance.
 */
import crypto from 'node:crypto';
import {
  type Tier,
  type TierDef,
  type SpendSummary,
  tierFor,
  ladderEnabled,
  estimateCostUsd,
  actualCostUsd,
  budgetExhausted,
} from './model-ladder';

export type InvokeMeta = {
  role: string;
  promptId: string;
  promptVersion: string;
  mode: 'production' | 'shadow' | 'dry_run';
  /** Requested ladder tier (default free). Set by engine per attempt. */
  tier?: Tier;
  /** 1-based attempt number, for logging/telemetry. */
  attempt?: number;
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
  /** Actual or estimated USD cost of this call (0 for free tier). */
  costUsd?: number;
  usage?: { promptTokens: number; completionTokens: number };
  /** True when a requested paid tier was refused for budget and free was used. */
  budgetFallback?: boolean;
};

export interface AgentInvoker {
  invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult>;
}

/**
 * Free-tier model policy: default is Pollinations' anonymous-tier `openai-fast`
 * (GPT-OSS 20B — reasoning + tool-calling, JSON-friendly). Roles can be upgraded
 * individually via POLLINATIONS_MODEL_<ROLE> (e.g. POLLINATIONS_MODEL_QC_PUBLISHER)
 * if a task proves too demanding for the free tier; everything stays free by default.
 */
export function modelForRole(role: string, fallback: string): string {
  const envKey = `POLLINATIONS_MODEL_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return process.env[envKey] || fallback;
}

const lastCallAt: Record<string, number> = {};
const MIN_CALL_GAP_MS = 3000; // pacing for the anonymous free tier
async function pace(key: string): Promise<void> {
  const now = Date.now();
  const wait = (lastCallAt[key] ?? 0) + MIN_CALL_GAP_MS - now;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt[key] = Date.now();
}

export function hashInput(packet: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(packet)).digest('hex').slice(0, 32);
}

/** Deterministic fixture-backed invoker. Fixtures map role → output JSON. */
export class EchoInvoker implements AgentInvoker {
  constructor(private fixtures: Map<string, unknown> = new Map()) {}

  setFixture(role: string, output: unknown) {
    this.fixtures.set(role, output);
  }

  async invoke(workPacket: unknown, _systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const start = Date.now();
    const out = this.fixtures.get(meta.role);
    if (out === undefined) {
      return { ok: false, error: `no fixture for role ${meta.role}`, durationMs: Date.now() - start };
    }
    return {
      ok: true,
      output: JSON.parse(JSON.stringify(out)), // deep clone
      model: 'echo-stub',
      provider: 'echo',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Pollinations text-API invoker (OpenAI-compatible endpoint). Requires
 * POLLINATIONS_TOKEN env for authenticated tiers; anonymous tier works without.
 * NOTE: system prompt contains no secrets; work packet contains no credentials.
 *
 * Transport strategy (free anonymous tier):
 *  1. POST /openai (OpenAI-compatible) — preferred.
 *  2. On failure, GET /{prompt}?model=…&json=true — the legacy anonymous GET
 *     path, which composes system instructions into the prompt. Both send the
 *     same content; no secrets in either.
 */
export class PollinationsInvoker implements AgentInvoker {
  constructor(
    private endpoint = process.env.POLLINATIONS_ENDPOINT || 'https://text.pollinations.ai/openai',
    // Default: Pollinations' free anonymous-tier model (GPT-OSS 20B, reasoning +
    // tool-calling, JSON-friendly). Override per role via POLLINATIONS_MODEL_<ROLE>.
    private model = process.env.POLLINATIONS_MODEL || 'openai-fast',
    private token = process.env.POLLINATIONS_TOKEN,
  ) {}

  private parseContent(content: string, start: number, model: string): InvokeResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Tolerate markdown-fenced or trailing prose around the JSON object.
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return { ok: false, error: 'non-JSON response', raw: content.slice(0, 500), provider: 'pollinations', model, durationMs: Date.now() - start };
      try { parsed = JSON.parse(m[0]); } catch {
        return { ok: false, error: 'non-JSON response', raw: content.slice(0, 500), provider: 'pollinations', model, durationMs: Date.now() - start };
      }
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
    const model = modelForRole(meta.role, this.model);
    await pace('pollinations');
    // Free 20B models comply far better with an explicit envelope skeleton.
    const userContent = `${JSON.stringify(workPacket)}\n\nReturn ONLY a JSON object exactly in this envelope:\n{"status":"ok"|"refused"|"escalate","confidence":0.0,"uncertainty":[],"escalation":{"reason_code":"…","detail":"…","recommended_action":"…"}|null,"payload":{…}}`;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          // JSON-only output contract
          response_format: { type: 'json_object' },
          private: true,
        }),
      });
      if (!res.ok) {
        // Anonymous-tier fallback: the GET path handles system prompts when the
        // POST route rejects them (observed ENOSPC 500s on system-bearing POSTs).
        const get = await this.invokeGet(workPacket, systemPrompt, model, start);
        if (get.ok) return get;
        return { ok: false, error: `pollinations HTTP ${res.status}`, provider: 'pollinations', model, durationMs: Date.now() - start };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      return this.parseContent(content, start, model);
    } catch (err: any) {
      return { ok: false, error: err?.message || 'invoker failure', provider: 'pollinations', model, durationMs: Date.now() - start };
    }
  }
}

/**
 * PaidOpenAIInvoker — any OpenAI-compatible paid endpoint (OpenRouter, Groq,
 * OpenAI, DeepSeek direct, …) configured via PAID_LLM_URL + PAID_LLM_API_KEY.
 * Captures token usage from the response and converts to USD via the tier's
 * blended rate; falls back to an estimate when usage is absent.
 */
export class PaidOpenAIInvoker implements AgentInvoker {
  constructor(
    private url = process.env.PAID_LLM_URL,
    private apiKey = process.env.PAID_LLM_API_KEY,
  ) {}

  async invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const start = Date.now();
    if (!this.url || !this.apiKey) {
      return { ok: false, error: 'paid invoker not configured (PAID_LLM_URL/PAID_LLM_API_KEY)', durationMs: Date.now() - start };
    }
    const tier = tierFor(meta.tier ?? 'paid_tier1');
    const userContent = `${JSON.stringify(workPacket)}\n\nReturn ONLY a JSON object exactly in this envelope:\n{"status":"ok"|"refused"|"escalate","confidence":0.0,"uncertainty":[],"escalation":{"reason_code":"…","detail":"…","recommended_action":"…"}|null,"payload":{…}}`;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: tier.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false, error: `paid HTTP ${res.status}`, provider: tier.provider, model: tier.model,
          tier: tier.id, durationMs: Date.now() - start,
          raw: body.slice(0, 300),
        };
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage ? {
        promptTokens: Number(data.usage.prompt_tokens) || 0,
        completionTokens: Number(data.usage.completion_tokens) || 0,
      } : undefined;
      const costUsd = usage
        ? actualCostUsd(tier.id, usage.promptTokens, usage.completionTokens)
        : estimateCostUsd(tier.id);
      // Same tolerance as the free tier: fenced/prose-wrapped JSON.
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (!m) return { ok: false, error: 'non-JSON response', provider: tier.provider, model: tier.model, tier: tier.id, costUsd, usage, durationMs: Date.now() - start };
        try { parsed = JSON.parse(m[0]); } catch {
          return { ok: false, error: 'non-JSON response', provider: tier.provider, model: tier.model, tier: tier.id, costUsd, usage, durationMs: Date.now() - start };
        }
      }
      return { ok: true, output: parsed, provider: tier.provider, model: tier.model, tier: tier.id, costUsd, usage, durationMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'paid invoker failure', provider: tier.provider, model: tier.model, tier: tier.id, durationMs: Date.now() - start };
    }
  }
}

export type SpendReader = () => Promise<SpendSummary | null>;

/**
 * LadderInvoker — routes each call to the tier the engine requested, with
 * budget enforcement: before any paid call, re-checks today's spend; if the
 * estimate would exceed the daily cap, refuses the paid leg and reports a
 * budget event so the engine can retry at free tier instead. Never throws.
 */
export class LadderInvoker implements AgentInvoker {
  constructor(
    private free: AgentInvoker,
    private paid: AgentInvoker | null,
    private getSpend: SpendReader,
  ) {}

  async invoke(workPacket: unknown, systemPrompt: string, meta: InvokeMeta): Promise<InvokeResult> {
    const tier = meta.tier ?? 'free';
    if (tier === 'free' || !ladderEnabled() || !this.paid) {
      const r = await this.free.invoke(workPacket, systemPrompt, { ...meta, tier: 'free' });
      return { ...r, tier: 'free', costUsd: 0 };
    }
    // Budget guard: estimate then enforce against today's paid spend.
    const est = estimateCostUsd(tier);
    let spend: SpendSummary | null = null;
    try {
      spend = await this.getSpend();
    } catch {
      spend = null; // if we can't read spend, be conservative: assume ample
    }
    if (budgetExhausted(spend, est)) {
      // Fall back to free tier for this call; the engine journals the budget hit.
      const r = await this.free.invoke(workPacket, systemPrompt, { ...meta, tier: 'free' });
      return { ...r, tier: 'free', costUsd: 0, budgetFallback: true };
    }
    const r = await this.paid.invoke(workPacket, systemPrompt, { ...meta, tier });
    return { ...r, tier, costUsd: r.costUsd ?? est };
  }
}
