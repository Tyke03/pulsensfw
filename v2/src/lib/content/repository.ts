import type { ContentRepositoryInfo } from '../publishing/ports';
import type { Entity, EntityType } from './entity-schema';
import type { Catalog, RawArticle, RawDeal, SearchHit, SearchType, Topic } from './types';

/**
 * Content seam. Phase 1 reads local MDX and JSON entities.
 * Phase 4 replaces `getContentRepository()` with a Supabase implementation
 * that returns the same shapes. Pages should not import the content files.
 * Drafts-only and publish keys stay on the server; see publishing/ports.ts.
 */
export interface ContentRepository {
  readonly info: ContentRepositoryInfo;
  listArticles(): Promise<RawArticle[]>;
  getArticle(slug: string): Promise<RawArticle | null>;
  listTopics(): Promise<Topic[]>;
  listDeals(): Promise<RawDeal[]>;
  listCatalog(): Promise<Catalog>;
  getEntity(type: EntityType, slug: string): Promise<Entity | null>;
  search(query: string, type?: SearchType): Promise<SearchHit[]>;
}
