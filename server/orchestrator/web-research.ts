/**
 * web-research.ts — give research agents REAL material from the open web.
 *
 * Purpose (Brent directive): research agents exist to FIND material; they must
 * not be fed a bare category name and left to refuse. This module performs the
 * deterministic, non-model parts of research:
 *   1. run category-specific web searches (pluggable providers),
 *   2. fetch the most relevant pages and extract readable text,
 *   3. attach an authority classification (official / news / community /
 *      unknown) so agents can cite honestly and mark low-trust sources,
 *   4. assemble a size-bounded "research material" work-packet section.
 *
 * Hard rules:
 * - Raw search/page content is DATA for the agents to curate; it is never
 *   auto-published and contains no secrets.
 * - The module never invents URLs: every hit carries the URL it came from.
 * - Search failures degrade to `materialError` on the packet (model refuses
 *   honestly instead of fabricating), never crash a tick.
 * - No API keys required for the default DuckDuckGo provider; Brave/Serper
 *   providers activate when their key env vars are set.
 */

export type AuthorityClass = 'official' | 'news' | 'community' | 'unknown';

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  authority: AuthorityClass;
};

export type FetchedDoc = {
  url: string;
  title: string;
  text: string;
  publishedHint?: string | null;
};

export type ResearchMaterial = {
  /** Category-topic queries that were actually run. */
  queries: string[];
  hits: SearchHit[];
  docs: FetchedDoc[];
  /** Set when search itself failed — packet consumers must refuse bingo. */
  materialError?: string;
  /** UTC timestamp of assembly (audit + cache-free idempotency aid). */
  gatheredAt: string;
};

export type WebSearchProvider = (query: string, limit: number) => Promise<SearchHit[]>;

// ── Provider implementations ────────────────────────────────────────────────

const UA = 'PulseNSFW-ResearchBot/1.0 (+https://pulsensfw.com)';

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

const COMMUNITY_HOSTS = new Set([
  'reddit.com', 'old.reddit.com', 'news.ycombinator.com', 'quora.com', 'medium.com',
  'discord.com', 'discord.gg', 'forums.somethingawful.com', 'xda-developers.com',
  'globeandmail-community.com', 'stackexchange.com', 'github.com',
]);
const NEWS_HOSTS = new Set([
  'reuters.com', 'apnews.com', 'theverge.com', 'techcrunch.com', 'wired.com',
  'arstechnica.com', 'engadget.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com',
  '404media.co', 'axios.com', 'bloomberg.com', 'ft.com', 'cnbc.com',
  'tomsguide.com', 'tomshardware.com', 'pcmag.com', 'cnet.com', 'gizmodo.com',
  'io9.gizmodo.com', 'vice.com', 'rollingstone.com', 'popsci.com',
  'digitaltrends.com', 'androidauthority.com', '9to5mac.com', 'zdnet.com',
  'theinformation.com', 'semafor.com', 'businessinsider.com', 'insider.com',
]);

/** Heuristic trust classification. Agents may downgrade but must not upgrade community → authoritative. */
export function classifyAuthority(url: string): AuthorityClass {
  const host = hostOf(url);
  if (!host) return 'unknown';
  const base = host.split('.').slice(-2).join('.');
  if (COMMUNITY_HOSTS.has(host) || COMMUNITY_HOSTS.has(base)) return 'community';
  if (NEWS_HOSTS.has(host) || NEWS_HOSTS.has(base)) return 'news';
  if (host.endsWith('.gov') || host.endsWith('.edu')) return 'official';
  return 'unknown';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

/** HTTP GET with hard bounds; returns text or throws a short error string. */
export async function httpGet(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/(xhtml|xml)/.test(type)) throw new Error(`unsupported content-type ${type}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > 400_000) throw new Error('payload too large');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 600_000) throw new Error('payload too large');
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/** Extract readable main-ish text from an HTML page (crude but bounded). */
export function htmlToText(html: string): { title: string; text: string; publishedHint: string | null } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()).slice(0, 200);
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const tds = s.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  const metaDate = s.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:updated_time|date)["'][^>]+content=["']([^"']+)["']/i);
  const publishedHint = (tds?.[1] ?? metaDate?.[1] ?? null) as string | null;
  s = s
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: s.slice(0, 8000), publishedHint };
}

// Bing RSS — keyless, parseable XML; worked where DuckDuckGo HTML was blocked
// (2026-10-13 production test: DDG returned 0 parseable results from Render
// IPs). Merges Bing NEWS RSS (actual dated articles — web RSS alone returned
// storefront/homepage pages that research models correctly refused) with web
// RSS to fill remaining slots.
export const bing: WebSearchProvider = async (query, limit) => {
  const parseRss = async (url: string): Promise<SearchHit[]> => {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`bing HTTP ${res.status}`);
    const xml = await res.text();
    const hits: SearchHit[] = [];
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    for (const item of items) {
      if (hits.length >= limit) break;
      const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim();
      const title = (item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
      const snippet = (item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (!/^https?:\/\//.test(link) || !title) continue;
      // Skip Bing's own query-echo wrapper items ("… - BingNews").
      if (title.endsWith('- BingNews') || (title === decodeEntities(title) && title.includes(query.slice(0, 20)))) continue;
      hits.push({
        title: decodeEntities(title).slice(0, 200),
        url: link,
        snippet: decodeEntities(snippet).slice(0, 320),
        authority: classifyAuthority(link),
      });
    }
    return hits;
  };
  const seen = new Set<string>();
  const merged: SearchHit[] = [];
  const add = (hs: SearchHit[]) => { for (const h of hs) { const k = h.url.replace(/[?#].*$/, ''); if (!seen.has(k)) { seen.add(k); merged.push(h); } } };
  // News first (fresh, dated); tolerate its absence (many niche queries have
  // zero news items), then web results to fill.
  for (const url of [
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&count=${limit}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=${limit}`,
  ]) {
    try { add(await parseRss(url)); } catch { /* next endpoint */ }
    if (merged.length >= limit) break;
  }
  if (merged.length === 0) throw new Error('bing returned no parseable results');
  return merged.slice(0, limit);
};

// DuckDuckGo HTML lite — no API key, best-effort HTML parse. Frequently
// bot-blocked at datacenter IPs; kept as a manual fallback option.
export const duckduckgo: WebSearchProvider = async (query, limit) => {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`duckduckgo HTTP ${res.status}`);
  const html = await res.text();
  const hits: SearchHit[] = [];
  const blocks = html.split('class="result__body"').slice(1);
  for (const b of blocks) {
    if (hits.length >= limit) break;
    const href = b.match(/class="result__a"[^>]*href="([^"]+)"/)?.[1];
    const title = decodeEntities(b.match(/class="result__a"[^>]*>([^<]+)</)?.[1] ?? '').trim();
    const snippet = decodeEntities(b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '').trim();
    if (!href || !title) continue;
    // DDG wraps destinations in /l/?uddg=<urlencoded>
    let url = href;
    if (url.includes('/l/?uddg=')) {
      const m = url.match(/uddg=([^&]+)/);
      if (m) url = decodeURIComponent(m[1]);
    }
    if (!/^https?:\/\//.test(url)) continue;
    hits.push({ title, url, snippet: snippet.slice(0, 320), authority: classifyAuthority(url) });
  }
  if (hits.length === 0) throw new Error('duckduckgo returned no parseable results');
  return hits;
};

// Brave Search API (BRAVE_SEARCH_API_KEY).
export const brave: WebSearchProvider = async (query, limit) => {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('brave provider needs BRAVE_SEARCH_API_KEY');
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`brave HTTP ${res.status}`);
  const j = await res.json() as any;
  return (j?.web?.results ?? []).slice(0, limit).map((r: any) => ({
    title: String(r.title ?? '').slice(0, 200),
    url: String(r.url ?? ''),
    snippet: String(r.description ?? '').slice(0, 320),
    authority: classifyAuthority(String(r.url ?? '')),
  })).filter((h: SearchHit) => h.url && h.title);
};

// Serper Google Search API (SERPER_API_KEY).
export const serper: WebSearchProvider = async (query, limit) => {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('serper provider needs SERPER_API_KEY');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: limit }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`serper HTTP ${res.status}`);
  const j = await res.json() as any;
  return (j?.organic ?? []).slice(0, limit).map((r: any) => ({
    title: String(r.title ?? '').slice(0, 200),
    url: String(r.link ?? ''),
    snippet: String(r.snippet ?? '').slice(0, 320),
    authority: classifyAuthority(String(r.link ?? '')),
  })).filter((h: SearchHit) => h.url && h.title);
};

const PROVIDERS: Record<string, WebSearchProvider> = { bing, duckduckgo, brave, serper };

export function searchProvider(): WebSearchProvider {
  const name = (process.env.RESEARCH_SEARCH_PROVIDER || 'bing').toLowerCase();
  return PROVIDERS[name] ?? bing;
}

// ── Category → search-queries map ───────────────────────────────────────────
// Plain web queries (no scope restriction): researchers find material anywhere
// on the internet; the writers curate it downstream.

const QUERY_TEMPLATES: Record<string, string[]> = {
  'ai-chatbots': ['CrushOn.AI Janitor AI Replika update news', 'Character AI c.ai guidelines NSFW update', 'AI girlfriend app comparison review 2026'],
  'sex-tech': ['Lovense Kiiroo Satisfyer device news release', 'teledildonics connected toy platform update', 'interactive sex tech launch announcement'],
  'vr': ['Meta Quest adult browser SIDR WankzVR news', 'VR adult platform update announcement 2026', 'sexlikevirtual vr headset content news'],
  'industry-news': ['OnlyFans Fansly platform policy announcement 2026', 'adult creator payout Visa Mastercard news', 'adult platform age verification law update'],
  'how-to': ['Lovense setup guide tutorial connect app', 'Meta Quest sideload adult browser how to', 'Janitor AI bot setup guide'],
  'rankings': ['best AI girlfriend apps comparison 2026', 'Lovense vs Kiiroo vs Satisfyer review', 'best VR adult platforms compared features'],
};

export function queriesFor(category: string): string[] {
  const base = QUERY_TEMPLATES[category] ?? [`${category} news`, `${category} guide`];
  const extra = process.env.RESEARCH_QUERY_EXTRA ? `[${category}] ${process.env.RESEARCH_QUERY_EXTRA}` : null;
  return extra ? [...base, extra].filter(Boolean) : base;
}

// ── Material assembly ───────────────────────────────────────────────────────

export const RESEARCH_SEARCH_RESULTS_DEFAULT = 6;
export const RESEARCH_FETCH_DOCS_DEFAULT = 2;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Gather material for one research work item. Degrades gracefully: search/API
 * failures produce `materialError` (agent must refuse rather than invent);
 * individual page-fetch failures are skipped silently.
 */
export async function gatherResearchMaterial(
  category: string,
  opts?: { transport?: WebSearchProvider; fetcher?: (url: string) => Promise<string>; maxHits?: number; maxDocs?: number },
): Promise<ResearchMaterial> {
  const gatheredAt = new Date().toISOString();
  const queries = queriesFor(category);
  const maxHits = opts?.maxHits ?? Number(process.env.RESEARCH_SEARCH_RESULTS || RESEARCH_SEARCH_RESULTS_DEFAULT);
  const maxDocs = opts?.maxDocs ?? Math.max(Number(process.env.RESEARCH_FETCH_DOCS || RESEARCH_FETCH_DOCS_DEFAULT), 0);
  const provider = opts?.transport ?? searchProvider();
  const fetcher = opts?.fetcher ?? ((url: string) => httpGet(url));

  const hits: SearchHit[] = [];
  let lastError: string | undefined;
  for (const q of queries.slice(0, 2)) {
    try {
      hits.push(...(await provider(q, maxHits)));
    } catch (e: any) {
      lastError = String(e?.message ?? e).slice(0, 200); // try the next query
    }
    if (hits.length >= maxHits) break;
  }
  if (hits.length === 0) {
    // Surface the actual provider error (or the empty-result case) so the
    // agent and the administrator can see WHY material is unavailable.
    return { queries, hits: [], docs: [], materialError: lastError ?? 'no search results retrievable', gatheredAt };
  }

  // Prefer non-community hits for deep fetch, but keep community hits visible.
  const fetchOrder = [...hits].sort((a, b) => rankForFetch(b) - rankForFetch(a));
  const docs: FetchedDoc[] = [];
  for (const hit of fetchOrder.slice(0, maxDocs)) {
    try {
      const html = await fetcher(hit.url);
      const { title, text, publishedHint } = htmlToText(html);
      if (text.length >= 400) docs.push({ url: hit.url, title: title || hit.title, text, publishedHint });
    } catch { /* skip unreachable page */ }
    await sleep(250); // polite pacing between fetches
  }
  return { queries, hits: hits.slice(0, maxHits), docs, gatheredAt };
}

function rankForFetch(h: SearchHit): number {
  const w = { official: 3, news: 2, unknown: 1, community: 0 } as const;
  return w[h.authority];
}

/** URLs the agent is allowed to cite out of this packet (normalization-light). */
export function citableUrls(material: ResearchMaterial | undefined): Set<string> {
  if (!material) return new Set();
  const norm = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  const out = new Set<string>();
  for (const h of material.hits) out.add(norm(h.url));
  for (const d of material.docs) out.add(norm(d.url));
  return out;
}
