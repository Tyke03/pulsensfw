import type { ContentRepositoryInfo } from '../publishing/ports';
import type { RawArticle, RawCharacter, RawDeal, RawGalleryItem, Topic } from './types';

/**
 * Content seam. Phase 1 reads local MDX and JSON.
 * Phase 4 replaces `getContentRepository()` with a Supabase implementation
 * that returns the same shapes. Pages should not import the seed files.
 */
export interface ContentRepository {
  readonly info: ContentRepositoryInfo;
  listArticles(): Promise<RawArticle[]>;
  getArticle(slug: string): Promise<RawArticle | null>;
  listTopics(): Promise<Topic[]>;
  listDeals(): Promise<RawDeal[]>;
  listCharacters(): Promise<RawCharacter[]>;
  listGallery(): Promise<RawGalleryItem[]>;
  search(query: string): Promise<RawArticle[]>;
}
