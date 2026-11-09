/**
 * Agent HTTP API — public reads (round 2E). Any valid agent key.
 * GET /api/agent/read/<kind>/<slug> or GET /api/agent/read/<kind>?slug=...
 * Reads cover published content only; drafts and unpublished research never
 * appear, and the reader context is always the SFW-safe default (a drafts
 * key is not an age verification).
 */
import type { APIRoute } from 'astro';
import { agentError, agentJson, getSlugParam } from '../../../../../lib/agent/http';
import { AgentError, agentReadPublishedArticle, agentReadPublishedEntity, agentSearchPublished, agentStore } from '../../../../../lib/agent/service';
import { resolveAgentAuth } from '../../../../../lib/agent/scopes';
import { getContentRepository } from '../../../../../lib/content/local-repository';
import { SEARCH_TYPES, type SearchType } from '../../../../../lib/content/types';
import type { PublicRepo } from '../../../../../lib/agent/service';
import type { EntityType } from '../../../../../lib/content/entity-schema';

export const prerender = false;

const agentRepo: PublicRepo = {
  listArticles: () => getContentRepository().listArticles(),
  getArticle: (slug: string) => getContentRepository().getArticle(slug),
  listCatalog: () => getContentRepository().listCatalog(),
  getEntity: (type: EntityType, slug: string) => getContentRepository().getEntity(type, slug),
};

export const GET: APIRoute = async ({ request, url, params }) => {
  const auth = await resolveAgentAuth(request.headers.get('authorization'));
  if (!auth) return agentJson({ error: 'agent-unauthenticated' }, 401);
  const kind = (params.kind ?? '').toLowerCase();
  try {
    if (kind === 'search') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (!q) throw new AgentError('agent-invalid-input', 400, 'Pass ?q=... (1+ chars).');
      const requested = url.searchParams.get('type') ?? 'all';
      const type = ((SEARCH_TYPES as readonly string[]).includes(requested) ? requested : 'all') as SearchType;
      return agentJson(await agentSearchPublished(agentRepo, q, type));
    }
    if (kind === 'article') {
      const slug = (params.slug ?? '').trim() || getSlugParam(url, 'slug');
      const article = await agentReadPublishedArticle(agentRepo, slug);
      if (!article) return agentJson({ error: 'missing', message: 'No published article for that slug.' }, 404);
      return agentJson(article);
    }
    if (['star', 'site', 'ai', 'product', 'game'].includes(kind)) {
      const slug = (params.slug ?? '').trim() || getSlugParam(url, 'slug');
      const entity = await agentReadPublishedEntity(agentRepo, kind, slug);
      if (!entity) return agentJson({ error: 'missing', message: 'No published entity for that slug.' }, 404);
      return agentJson(entity);
    }
    void agentStore; // reads never need the mutation store
    return agentJson({ error: 'agent-invalid-input', message: 'Unknown public read kind.' }, 404);
  } catch (error) {
    if (error instanceof AgentError && error.httpStatus >= 500) {
      return agentJson({ error: 'agent-unconfigured', message: 'Reads serve the published overlay; local fixtures carry the base content.' }, 503);
    }
    return agentError(error);
  }
};
