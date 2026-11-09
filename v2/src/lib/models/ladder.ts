/**
 * Shared model ladder (round 2F) — one configuration + routing logic reused by
 * external agents and the Persona Concierge.
 *
 * Tiers: strongest suitable prose models through OneProvider (descending),
 * then a Venice fallback. Both use OpenAI-compatible endpoints:
 *   OneProvider — https://api.oneprovider.dev/v1  (docs: https://oneprovider.dev/docs,
 *   models: https://oneprovider.dev/docs/api/models; accessed 2026-11-06)
 *   Venice      — OpenAI-compatible chat completions
 *   (docs: https://docs.venice.ai/, models overview: https://docs.venice.ai/models/overview;
 *   accessed 2026-11-06)
 *
 * Model IDs come from env (`MODELS_MAIN_IDS`, `MODELS_FALLBACK_IDS` — CSV,
 * best first) and are never invented here. When credentials exist, IDs are
 * validated against the provider's actual /models list; unknown IDs stay
 * disabled (and are reported as such — never silently attempted). Without
 * credentials the ladder reports 'unconfigured'; everything downstream shows
 * the honest unavailable state. No purchases and no account creation happen
 * in code — only the owner can provision keys.
 */
export type LadderGuard = {
  /** Cost/budget gate before a call. Not allowed → never attempts the call. */
  beforeCall(modelId: string): Promise<{ allowed: boolean; reason?: string }>;
  /** Concurrency slot: false means the server is at its cap right now. */
  enter(): boolean;
  exit(): void;
};

export type LadderTier = {
  scope: 'main' | 'fallback';
  modelId: string;
  baseUrl: string;
  /** Cost per 1M output tokens when configured; null = unknown (token caps only). */
  costPerMTok: number | null;
};

export type LadderConfig = {
  tiers: LadderTier[];
  mainConfigured: boolean;
  fallbackConfigured: boolean;
};

const REFUSAL_MARKERS: RegExp[] = [
  /i can(?:'|no)t help with/i,
  /i cannot (?:help|assist|provide|comply)/i,
  /i won(?:'|no)t (?:provide|help|assist)/i,
  /i(?:'| a)m unable to (?:help|assist|provide)/i,
  /violate[sd]? (?:my|our|the) (?:policies|guidelines)/i,
  /not something i(?:'|) can (?:help|provide)/i,
];

export function isRefusal(text: string): boolean {
  return REFUSAL_MARKERS.some((marker) => marker.test(text.slice(0, 400)));
}

function splitIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function costList(raw: string | undefined): Array<number | null> {
  const parts = (raw ?? '').split(',').map((part) => {
    const value = Number.parseFloat(part.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  return parts;
}

export function ladderConfig(env: Record<string, string | undefined> = envSafe()): LadderConfig {
  const mainUrl = (env.MODELS_MAIN_API_URL ?? '').trim();
  const mainKey = (env.MODELS_MAIN_API_KEY ?? '').trim();
  const mainIds = splitIds(env.MODELS_MAIN_IDS);
  const mainCosts = costList(env.MODELS_MAIN_COSTS_USD_PER_MTOK);
  const fallbackUrl = (env.MODELS_FALLBACK_API_URL ?? '').trim();
  const fallbackKey = (env.MODELS_FALLBACK_API_KEY ?? '').trim();
  const fallbackIds = splitIds(env.MODELS_FALLBACK_IDS);
  const fallbackCosts = costList(env.MODELS_FALLBACK_COSTS_USD_PER_MTOK);
  const tiers: LadderTier[] = [];
  mainIds.forEach((modelId, index) => {
    if (mainUrl && mainKey) {
      tiers.push({ scope: 'main', modelId, baseUrl: mainUrl, costPerMTok: mainCosts.at(index) ?? null });
    }
  });
  fallbackIds.forEach((modelId, index) => {
    if (fallbackUrl && fallbackKey) {
      tiers.push({ scope: 'fallback', modelId, baseUrl: fallbackUrl, costPerMTok: fallbackCosts.at(index) ?? null });
    }
  });
  const mock = env.CONCIERGE_DEV_MOCK === '1';
  void mock;
  return {
    tiers,
    mainConfigured: Boolean(mainUrl && mainKey && mainIds.length > 0),
    fallbackConfigured: Boolean(fallbackUrl && fallbackKey && fallbackIds.length > 0),
  };
}

function envSafe(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> | undefined;
  tool_call_id?: string | undefined;
};

export type ChatTool = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type AttemptStatus = 'ok' | 'refusal' | 'outage' | 'empty' | 'budget';

export type AttemptRow = { model: string; status: AttemptStatus };

export type ChatOutcome =
  | {
      status: 'ok';
      model: string;
      text: string;
      toolCalls?: ChatMessage['tool_calls'];
      usage: { prompt: number; completion: number };
      costUsd: number | null;
      attempts: AttemptRow[];
    }
  | {
      status: 'unavailable';
      reason: 'unconfigured' | 'policy-locked' | 'all-outage' | 'budget';
      attempts: AttemptRow[];
    };

export type RunChatOptions = {
  messages: ChatMessage[];
  tools?: ChatTool[];
  maxAttempts?: number;
  timeoutMs?: number;
  tokenCeiling?: number;
  fetchImpl?: typeof fetch;
  /** Disabled model ids (e.g., unknown IDs that failed provider list validation). */
  disabled?: ReadonlySet<string>;
  guard?: LadderGuard;
};

const CHAT_TIMEOUT_DEFAULT = 45_000;

async function callOnce(
  tier: LadderTier,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ text: string; toolCalls: ChatMessage['tool_calls']; usage: { prompt: number; completion: number } } | 'policy' | 'outage' | 'empty'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${tier.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status >= 500) return 'outage';
    if (response.status === 401 || response.status === 403) return 'outage'; // creds bad — not a policy answer
    if (response.status === 429) return 'outage';
    if (!response.ok) {
      const detail = await response.text();
      // Provider-level policy gate for the model itself.
      if (detail && /policy|refus/i.test(detail.slice(0, 500))) return 'policy';
      return 'outage';
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatMessage['tool_calls'] } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = data.choices?.[0]?.message;
    const refusalText = message?.content ?? '';
    if (message?.tool_calls && message.tool_calls.length > 0) {
      return {
        text: refusalText || '',
        toolCalls: message.tool_calls,
        usage: {
          prompt: data.usage?.prompt_tokens ?? 0,
          completion: data.usage?.completion_tokens ?? 0,
        },
      };
    }
    if (!refusalText.trim()) return 'empty';
    if (isRefusal(refusalText)) return 'policy';
    return {
      text: refusalText,
      toolCalls: undefined,
      usage: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') return 'outage';
    return 'outage';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Route a chat call through the ladder. Errors are classified narrowly:
 * policy refusals (matched markers only — ambiguous text does not count) move
 * to the next tier; timeouts, network failures, 4xx/5xx and empty output are
 * outages; empty is tracked separately. Same restrictions on every retry.
 */
export async function runChat(options: RunChatOptions): Promise<ChatOutcome> {
  return runChatWith(envSafe(), options);
}

export async function runChatWith(
  env: Record<string, string | undefined>,
  options: RunChatOptions,
): Promise<ChatOutcome> {
  const config = ladderConfig(env);
  if (config.tiers.length === 0) {
    return { status: 'unavailable', reason: 'unconfigured', attempts: [] };
  }
  const apiKeyMain = (env.MODELS_MAIN_API_KEY ?? '').trim();
  const apiKeyFallback = (env.MODELS_FALLBACK_API_KEY ?? '').trim();
  const candidates = config.tiers.filter((tier) => !options.disabled?.has(tier.modelId));
  if (candidates.length === 0) {
    return { status: 'unavailable', reason: 'all-outage', attempts: [] };
  }
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, candidates.length));
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_DEFAULT;
  const ceiling = options.tokenCeiling ?? 1200;
  const attempts: AttemptRow[] = [];
  let triedMain = 0;
  let triedFallback = 0;
  for (const tier of candidates) {
    if (triedMain + triedFallback >= maxAttempts) break;
    if (tier.scope === 'main') triedMain += 1; else triedFallback += 1;
    const budget = options.guard ? await options.guard.beforeCall(tier.modelId) : { allowed: true };
    if (!budget.allowed) {
      attempts.push({ model: tier.modelId, status: 'budget' });
      return { status: 'unavailable', reason: 'budget', attempts };
    }
    if (options.guard && !options.guard.enter()) {
      attempts.push({ model: tier.modelId, status: 'budget' });
      return { status: 'unavailable', reason: 'budget', attempts };
    }
    const result = await callOnce(
      tier,
      tier.scope === 'main' ? apiKeyMain : apiKeyFallback,
      {
        model: tier.modelId,
        messages: options.messages,
        ...(options.tools && options.tools.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {}),
        max_tokens: ceiling,
        temperature: 0.3,
      },
      timeoutMs,
      options.fetchImpl ?? fetch,
    );
    if (options.guard) options.guard.exit();
    if (result === 'policy') {
      attempts.push({ model: tier.modelId, status: 'refusal' });
      continue; // Policy refusal → next tier (never retried in place).
    }
    if (result === 'outage') {
      attempts.push({ model: tier.modelId, status: 'outage' });
      continue; // Timeout/network/rate limits → next tier.
    }
    if (result === 'empty') {
      attempts.push({ model: tier.modelId, status: 'empty' });
      continue; // Empty output ≠ refusal — tracked separately, next tier.
    }
    attempts.push({ model: tier.modelId, status: 'ok' });
    return {
      status: 'ok',
      model: tier.modelId,
      text: result.text,
      toolCalls: result.toolCalls,
      usage: result.usage,
      costUsd: tier.costPerMTok === null ? null : (result.usage.completion / 1_000_000) * tier.costPerMTok,
      attempts: attempts.slice(),
    };
  }
  const anyRefusal = attempts.some((attempt) => attempt.status === 'refusal');
  return {
    status: 'unavailable',
    reason: anyRefusal && attempts.every((attempt) => attempt.status !== 'ok') ? 'policy-locked' : 'all-outage',
    attempts,
  };
}
