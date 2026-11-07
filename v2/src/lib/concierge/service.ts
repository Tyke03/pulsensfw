/**
 * Persona Concierge (round 2F) — server side.
 *
 * The Concierge is model-driven over a small, enforced, server-side tool
 * allowlist: search_published, read_published, compare_run. It can only
 * search, filter, compare and read PUBLISHED content, and it returns
 * citations that the server validates against real site pages. There are
 * no mutation tools and no drafts/publish credentials anywhere near it.
 *
 * Age/SFW is applied SERVER-side in retrieval + tool results — not merely in
 * system prompts:
 *   - production (AGE_VENDOR_API_URL + AGE_VENDOR_API_KEY set): NSFW content
 *     needs a cookie the vendor flow issued ("vendor.*"). The dev stub cookie
 *     ("stub.v1") never unlocks production NSFW — fail closed.
 *   - dev without vendor env: the stub cookie may unlock for local fixtures,
 *     and the UI labels that state rather than staying silent.
 * Missing required configuration (model credentials, store) fails closed to
 * the honest "unavailable"/"quota" states instead of improvising answers.
 */
import { searchCatalog } from '../content/present';
import { loadCompare, compareRows } from '../content/compare';
import { entityHref } from '../content/entities';
import { readReader } from '../reader/cookies';
import type { CookieStore } from '../reader/cookies';
import { runChat, ladderConfig, type ChatMessage, type ChatTool, type LadderGuard } from '../models/ladder';
import { UsageTracker } from '../models/usage';
import type { ReaderMode, RawArticle } from '../content/types';
import type { EntityType, Entity } from '../content/entity-schema';

export type ConciergeRepo = {
  listArticles(): Promise<RawArticle[]>;
  listCatalog(): Promise<{ entities: Entity[] }>;
  getArticle(slug: string): Promise<RawArticle | null>;
  getEntity(type: EntityType, slug: string): Promise<Entity | null>;
};

export type ConciergeState =
  | { status: 'ok'; nsfwAllowed: boolean; ageMode: 'stub-ok' | 'vendor-ok'; modelPlan: 'ladder' | 'dev-fixture' }
  | { status: 'unconfigured'; because: 'no-models' }
  | { status: 'quota'; because: 'session-turns' | 'cost-cap' | 'busy' };

export type ToolResult = {
  tool: string;
  summary: string;
  citations: ConciergeCitation[];
  payload: unknown;
};

export type ConciergeCitation = {
  label: string;
  href: string;
};

const TOOL_NAMES = ['search_published', 'read_published', 'compare_run'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const TOOL_DEFS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_published',
      description: 'Full text search over published PulseNSFW pages (articles, stars, sites, AI, products, games).',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string' }, type: { type: 'string', enum: ['all', 'article', 'star', 'site', 'ai', 'product', 'game'] } },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_published',
      description: 'Read one published record (article or entity) as factual JSON — score, pricing, facts, pros/cons.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['article', 'star', 'site', 'ai', 'product', 'game'] },
          slug: { type: 'string' },
        },
        required: ['kind', 'slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_run',
      description: 'Side-by-side comparison of 2–4 published entities of one kind. Missing facts are dashes.',
      parameters: {
        type: 'object',
        properties: { ids: { type: 'string', description: 'CSV of 2–4 entity slugs of the same kind' } },
        required: ['ids'],
      },
    },
  },
];

/** Age/SFW gate: retrieval + tool results obey it server-side. */
export function conciergeGate(
  cookies: CookieStore,
  secure: boolean,
  envOverride: Record<string, string | undefined> = envSafe(),
): ConciergeState {
  const reader: ReaderMode = readReader(cookies, secure);
  const vendorConfigured = Boolean(envOverride?.AGE_VENDOR_API_URL && envOverride?.AGE_VENDOR_API_KEY);
  const config = ladderConfig(envOverride);
  if (!config.tiers.length) {
    // Dev fixture mode is a visible, labeled state — the UI never pretends a
    // real model is answering.
    const devMock = envOverride?.CONCIERGE_DEV_MOCK === '1';
    if (!devMock) return { status: 'unconfigured', because: 'no-models' };
  }
  if (!reader.ageVerified) return { status: 'ok', nsfwAllowed: false, ageMode: 'stub-ok', modelPlan: config.tiers.length ? 'ladder' : 'dev-fixture' };
  if (vendorConfigured) {
    // Production: only vendor-issued cookies clear NSFW. Stub never does.
    const cookieValue = cookies.get('pulse_age')?.value ?? '';
    const vendorOk = /^vendor\./.test(cookieValue);
    return { status: 'ok', nsfwAllowed: vendorOk && reader.nsfw, ageMode: vendorOk ? 'vendor-ok' : 'stub-ok', modelPlan: config.tiers.length ? 'ladder' : 'dev-fixture' };
  }
  return { status: 'ok', nsfwAllowed: reader.nsfw, ageMode: 'stub-ok', modelPlan: config.tiers.length ? 'ladder' : 'dev-fixture' };
}

/** Execute one allowlisted tool. SFW gate applies to every retrieval. */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  reader: ReaderMode,
  repo?: ConciergeRepo,
): Promise<ToolResult> {  if (name !== 'search_published' && name !== 'read_published' && name !== 'compare_run') {
    throw new Error(`tool-not-allowlisted: ${name}`);
  }
  const site = repo ?? (await lazyDefaultRepo());
  if (name === 'search_published') {
    const q = String(args.q ?? '').slice(0, 96);
    const type = (String(args.type ?? 'all') || 'all') as import('../content/types').SearchType;
    const [articles, catalog] = await Promise.all([site.listArticles(), site.listCatalog()]);
    const hits = searchCatalog(articles, catalog, q, type, reader).slice(0, 8);
    return {
      tool: name,
      summary: `${hits.length} matches for “${q}”`,
      citations: hits.map((hit) => ({ label: hit.title, href: hit.href })),
      payload: hits.map((hit) => ({ title: hit.title, kind: hit.kicker, href: hit.href, dek: hit.dek })),
    };
  }
  if (name === 'read_published') {
    const kind = String(args.kind ?? '');
    const slug = String(args.slug ?? '').toLowerCase();
    if (kind === 'article') {
      const article = await site.getArticle(slug);
      if (!article) return { tool: name, summary: 'No published article found.', citations: [], payload: null };
      const payload = {
        title: article.title,
        dek: article.dek,
        publishedLabel: article.publishedAt.toISOString().slice(0, 10),
        topics: article.topic,
        entities: article.entitySlugs,
        sources: article.sources,
        explicitIncluded: reader.nsfw ? article.explicitImages.length : 0,
      };
      return { tool: name, summary: article.title, citations: [{ label: article.title, href: `/story/${article.slug}` }], payload };
    }
    const types: Record<string, import('../content/entity-schema').EntityType> = { star: 'star', site: 'site', ai: 'ai_app', product: 'product', game: 'game' };
    const type = types[kind];
    const entity = type ? await site.getEntity(type, slug) : null;
    if (!entity) return { tool: name, summary: 'No published entity found.', citations: [], payload: null };
    const payload = {
      name: entity.name,
      type: entity.type,
      score: entity.score,
      pricing: entity.pricing,
      platforms: entity.platforms,
      lastChecked: entity.updated,
      pros: entity.pros,
      cons: entity.cons,
      facts: entity.facts,
    };
    return { tool: name, summary: entity.name, citations: [{ label: entity.name, href: entityHref(entity.type, entity.slug) }], payload };
  }
  const ids = String(args.ids ?? '');
  const catalog = await site.listCatalog();
  const state = loadCompare(catalog, ids.match(/^[a-z0-9,-]+$/i) ? ids.toLowerCase().split(',').map((part) => part.trim()) : []);
  if (state.status !== 'ok') {
    return { tool: name, summary: `Compare unavailable (${state.status}).`, citations: [], payload: { status: state.status } };
  }
  return {
    tool: name,
    summary: `Compare ${state.entities.length} ${state.kindPlural}`,
    citations: state.entities.map((entity) => ({ label: entity.name, href: entityHref(entity.type, entity.slug) })),
    payload: compareRows(state.entities),
  };
}

/**
 * Runtime default repo — resolved lazily so tests (plain node) can inject a
 * fixture without touching astro:content.
 */
async function lazyDefaultRepo(): Promise<ConciergeRepo> {
  const { getContentRepository } = await import('../content/local-repository');
  const inner = getContentRepository();
  return {
    listArticles: () => inner.listArticles(),
    listCatalog: () => inner.listCatalog(),
    getArticle: (slug: string) => inner.getArticle(slug),
    getEntity: (type: EntityType, slug: string) => inner.getEntity(type, slug),
  };
}

/** Citations the model may hyperlink: only URLs the tools actually returned. */export function validateCitations(returned: ConciergeCitation[], text: string): ConciergeCitation[] {
  const referenced = returned.filter((citation) => text.includes(citation.href));
  if (referenced.length > 0) return referenced;
  return returned.slice(0, 6);
}

const SYSTEM_PROMPT = [
  'You are the PulseNSFW Concierge — a dark-desk assistant that helps adult readers find reviews, ratings and comparisons on pulsensfw.com.',
  'You may ONLY answer about published site content using the provided tools (search_published, read_published, compare_run).',
  'Never invent scores, prices, or facts. Missing facts are dashes. When a tool answers, cite the page it gave (markdown link using the exact href).',
  'Comply with the site’s SFW presentation: describe content factually; you never describe explicit imagery or link NSFW-only media.',
  'If the answer needs content the site has not published, say so plainly and offer a real site page as an alternative.',
].join('\n');

export type TurnResult =
  | { status: 'ok'; text: string; citations: ConciergeCitation[]; model: string; rounds: number; attempts: number }
  | { status: 'unavailable'; reason: 'unconfigured' | 'policy-locked' | 'all-outage' | 'budget'; attempts: number };export type TurnOptions = {
  history: ChatMessage[];
  prompt: string;
  reader: ReaderMode;
  sessionHash: string;
  maxAttempts: number;
  timeoutMs: number;
  tokenCeiling: number;
  tracker: UsageTracker;
  fetchImpl?: typeof fetch;
};

/** Dev fixture: scripted tool runs for local screenshots. Never production. */
/** Runtime env access isolated so unit tests pass overrides. */
function envSafe(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

/* Dev fixture: scripted tool runs for local screenshots. Never production. */
export function conciergeFixtureMode(): boolean {
  return envSafe().CONCIERGE_DEV_MOCK === '1';
}

const FIXTURE_HEADER = 'Dev fixture answer (no live model configured — server tool path rehearsed with real published data).';

const KIND_WORDS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'ai', pattern: /\bai\b|chatbot|companion/i },
  { kind: 'site', pattern: /\bsites?\b|tube|network/i },
  { kind: 'star', pattern: /\bstar(?:s)?\b|performer|creator/i },
  { kind: 'product', pattern: /\btoy|gear|product/i },
  { kind: 'game', pattern: /\bgame|vr\b/i },
];

const STOP_TOKENS = new Set(['compare', 'versus', 'vs', 'please', 'the', 'a', 'an', 'of', 'to', 'like', 'best', 'big']);

async function fixtureSearch(repositoryPrompt: string, reader: ReaderMode): Promise<ToolResult> {
  const tokens = repositoryPrompt.toLowerCase().split(/\s+/).filter((token) => token && !STOP_TOKENS.has(token));
  const queries: string[] = [tokens.slice(-2).join(' '), tokens.at(-1) ?? ''].filter(Boolean);
  let fallback: ToolResult | null = null;
  for (const q of queries) {
    const result = await runTool('search_published', { q }, reader);
    if (result.citations.length > 0) return result;
    fallback = fallback ?? result;
  }
  return fallback ?? { tool: 'search_published', summary: 'No matches', citations: [], payload: [] };
}

async function runFixtureTurn(options: TurnOptions): Promise<TurnResult> {
  const clean = options.prompt.replace(/[^\w\s-]/g, ' ').trim().slice(0, 96) || 'the desk';
  const results: ToolResult[] = [];
  const search = await fixtureSearch(clean, options.reader);
  results.push(search);
  if (/compare|versus|\bvs\b/i.test(options.prompt)) {
    for (const { kind, pattern } of KIND_WORDS) {
      if (!pattern.test(options.prompt)) continue;
      const tokenQueries: string[] = clean.toLowerCase().split(/\s+/)
        .filter((token) => token && !STOP_TOKENS.has(token));
      const q = tokenQueries.slice(-2).join(' ') || (tokenQueries.at(-1) ?? clean);
      const byKind = await runTool('search_published', { q, type: kind }, options.reader);
      let pool = byKind;
      if (pool.citations.length < 2) {
        // Retry token-by-token until the kinds glue to real published rows.
        for (const token of tokenQueries.reverse()) {
          const retry = await runTool('search_published', { q: token, type: kind }, options.reader);
          if (retry.citations.length >= 2) {
            pool = retry;
            break;
          }
        }
      }
      const slugs = pool.citations
        .filter((citation) => citation.href.startsWith('/') && !citation.href.startsWith('/story/'))
        .map((citation) => String(citation.href.split('/').pop() ?? '').trim())
        .slice(0, 2)
        .filter(Boolean);
      if (slugs.length === 2) {
        const compare = await runTool('compare_run', { ids: slugs.join(',') }, options.reader);
        results.push(compare);
      } else {
        results.push({
          tool: 'compare_run',
          summary: 'Not enough same-kind published matches for a fair side-by-side.',
          citations: pool.citations.slice(0, 2),
          payload: [],
        });
      }
      break;
    }
  }
  const lines = results.map((result) => `• ${result.summary}${result.citations.length ? ` — ${result.citations.slice(0, 3).map((citation) => citation.label).join(', ')}` : ''}`);
  const promptTokens = Math.max(8, Math.round(options.prompt.length / 4));
  const completionTokens = Math.max(16, Math.round(lines.join('\n').length / 4));
  await options.tracker.recordCall(options.sessionHash, 'dev-fixture/none', promptTokens, completionTokens, null);
  return {
    status: 'ok',
    text: `${FIXTURE_HEADER}\n${lines.join('\n')}`,
    citations: results.flatMap((result) => result.citations).slice(0, 8),
    model: 'dev-fixture/none',
    rounds: results.length,
    attempts: results.length,
  };
}

/** One user turn through the model ladder with the tool loop. */
export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  if (conciergeFixtureMode()) return runFixtureTurn(options);
  const results: ToolResult[] = [];
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...options.history,
    { role: 'user', content: options.prompt },
  ];
  let answer: string | null = null;
  let modelUsed = '';
  let attemptsTotal = 0;
  let rounds = 0;
  const guard: LadderGuard = {
    async beforeCall() {
      return { allowed: true };
    },
    enter() {
      return options.tracker.concurrencySlot();
    },
    exit() {
      options.tracker.releaseSlot();
    },
  };
  for (rounds = 0; rounds < 5; rounds += 1) {
    const outcome = await runChat({
      messages,
      tools: TOOL_DEFS,
      maxAttempts: options.maxAttempts,
      timeoutMs: options.timeoutMs,
      tokenCeiling: options.tokenCeiling,
      guard,
      fetchImpl: options.fetchImpl,
    });
    attemptsTotal += outcome.status === 'ok' ? outcome.attempts.length : outcome.attempts.length;
    if (outcome.status !== 'ok') {
      return { status: 'unavailable', reason: outcome.reason, attempts: attemptsTotal };
    }
    modelUsed = outcome.model;
    const usage = outcome.usage;
    const costMicro = outcome.costUsd === null ? null : Math.round(outcome.costUsd * 1_000_000);
    await options.tracker.recordCall(options.sessionHash, outcome.model, usage.prompt, usage.completion, costMicro);
    if (!outcome.toolCalls?.length) {
      answer = outcome.text;
      break;
    }
    messages.push({ role: 'assistant', content: outcome.text || '', tool_calls: outcome.toolCalls });
    for (const call of outcome.toolCalls) {
      const name = call.function.name;
      let payload = {};
      try {
        payload = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        payload = {};
      }
      // Allowlist enforcement happens again inside runTool.
      const result = await runTool(name, payload, options.reader);
      results.push(result);
      messages.push({ role: 'tool', content: JSON.stringify({ summary: result.summary, payload: result.payload }), tool_call_id: call.id });
    }
  }
  if (answer === null) answer = toolResultsDigest(results, options.reader.nsfw);
  const citations = validateCitations(results.flatMap((result) => result.citations), answer ?? '');
  return { status: 'ok', text: answer, citations, model: modelUsed || 'ladder', rounds, attempts: attemptsTotal };
}

/** Last-resort digest when the model answered with tools but no prose. */
function toolResultsDigest(results: ToolResult[], nsfwAllowed: boolean): string {
  if (results.length === 0) {
    return 'The desk has no published content on that yet. Ask again on the search page or through the contact form.';
  }
  const nsfwNote = nsfwAllowed ? '' : ' (SFW mode was on for this view.)';
  const lines = results.slice(0, 6).map((result) => `• ${result.summary} — ${result.citations.map((citation) => `<a href="${citation.href}">${citation.label}</a>`).join(', ')}`);
  return `From the published desk${nsfwNote}:\n${lines.join('\n')}`;
}

export { TOOL_NAMES };
