import type { APIRoute } from 'astro';
import { searchCatalog } from '../../lib/content/present';
import { getContentRepository } from '../../lib/content/local-repository';
import { readReader } from '../../lib/reader/cookies';
import { SEARCH_TYPES, type SearchType } from '../../lib/content/types';

/** Live suggestion feed for the header / home search forms. Read-only, sends no state. */
const LIVE_LIMIT = 8;

export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const reader = readReader(cookies, secure);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 96);
  const requested = url.searchParams.get('type') ?? 'all';
  const type: SearchType = (SEARCH_TYPES as readonly string[]).includes(requested) ? requested as SearchType : 'all';
  const repo = getContentRepository();
  const hits = !q && type === 'all'
    ? []
    : searchCatalog(await repo.listArticles(), await repo.listCatalog(), q, type, reader).slice(0, LIVE_LIMIT);
  return Response.json(
    { q, type, count: hits.length, hits },
    { headers: { 'cache-control': 'no-store' } },
  );
};
