/**
 * Hybrid content repository (round 2E).
 *
 * Base: the existing local content collections (development fixtures and the
 * fallback catalog). Overlay: agent-published content from the Supabase agent
 * store (published states only — drafts, revisions and research stay out).
 *
 * Source-of-truth rule (documented for the pipeline):
 *  - local content collections = seeded fixtures;
 *  - agent store = live publication layer for research/QC flow;
 *  - a published override REPLACES the base record for its slug (drafts that
 *    were seeded locally keep their slug history in agent_revisions).
 * When the Supabase env is missing entirely, the local seed remains the
 * truth and the pages keep working (development fixtures context).
 */
import type { ContentRepositoryInfo } from '../publishing/ports';
import type { Catalog, RawArticle, RawDeal, SearchHit, SearchType, Topic } from './types';
import type { Entity, EntityType } from './entity-schema';
import type { Store } from '../agent/store';
import type { DraftEntityState, DraftState } from '../agent/state';

export type PublishedOverride = { slug: string; state: DraftState };

type BaseRepo = {
  listArticles(): Promise<RawArticle[]>;
  getArticle(slug: string): Promise<RawArticle | null>;
  listTopics(): Promise<Topic[]>;
  listDeals(): Promise<RawDeal[]>;
  listCatalog(): Promise<Catalog>;
  getEntity(type: EntityType, slug: string): Promise<Entity | null>;
  search(query: string, type?: SearchType): Promise<SearchHit[]>;
};

export class HybridContentRepository {
  readonly info: ContentRepositoryInfo;
  private base: BaseRepo;
  private store: Store | null;
  private cacheMs: number;
  private cacheAt = 0;
  private overrides: Map<string, DraftState> = new Map();

  constructor(base: BaseRepo, store: Store | null, cacheMs = 60_000) {
    this.base = base;
    this.store = store;
    this.info = store
      ? ({ source: 'local-seed+agent-store' } as ContentRepositoryInfo)
      : ({ source: 'local-seed' } satisfies ContentRepositoryInfo);
    this.cacheMs = cacheMs;
  }

  private async overridesReady(): Promise<Map<string, DraftState>> {
    if (!this.store) return this.overrides;
    const now = Date.now();
    if (this.overrides.size === 0 || now - this.cacheAt > this.cacheMs) {
      try {
        const rows: Array<{ slug: string; state: DraftState }> = await this.store.listPublishedStates();
        this.overrides = new Map(rows.map((row) => [row.slug, row.state]));
        this.cacheAt = now;
      } catch {
        // Publication read failed: serve the local seed rather than guessing.
      }
    }
    return this.overrides;
  }

  private overrideToArticle(slug: string, state: DraftState): RawArticle | null {
    if (state.kind !== 'article') return null;
    return {
      slug,
      title: state.title,
      dek: state.dek,
      topic: state.topic,
      kind: state.kind2,
      publishedAt: new Date(),
      badges: [],
      author: state.author || 'PulseNSFW desk',
      kicker: state.kicker || 'Desk',
      readingMinutes: Math.max(1, Math.round(state.blocks.reduce((count, block) => {
        const words = (block.type === 'ul' ? block.items.join(' ') : block.text ?? '').split(/\s+/).filter(Boolean).length;
        return count + words;
      }, 0) / 210)),
      placement: 'stack',
      rails: [],
      tags: state.tags ?? [],
      cover: state.cover,
      explicitImages: (state.images ?? []).filter((image) => image.explicit),
      entitySlugs: state.entities ?? [],
      sources: state.sources ?? [],
      checkedAt: state.checkedAt ? new Date(state.checkedAt) : undefined,
      bodyText: state.blocks.map((block) => (block.type === 'ul' ? block.items.join(' · ') : block.text ?? '')).join('\n\n'),
      bodyBlocks: state.blocks,
    };
  }

  async listArticles(): Promise<RawArticle[]> {
    const base = await this.base.listArticles();
    const overrides = await this.overridesReady();
    const overridden = new Set<string>();
    const published: RawArticle[] = [];
    for (const [slug, state] of overrides) {
      const article = this.overrideToArticle(slug, state);
      if (article) {
        published.push(article);
        overridden.add(slug);
      } else if (state.kind === 'entity') {
        // Entity overrides surface via the catalog; no article page.
      }
    }
    return [...base.filter((article) => !overridden.has(article.slug)), ...published]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  async getArticle(slug: string): Promise<RawArticle | null> {
    const overrides = await this.overridesReady();
    const override = overrides.get(slug);
    if (override) {
      const article = this.overrideToArticle(slug, override);
      if (article) return article;
    }
    return this.base.getArticle(slug);
  }

  async listTopics(): Promise<Topic[]> {
    return this.base.listTopics();
  }

  async listDeals(): Promise<RawDeal[]> {
    return this.base.listDeals();
  }

  async listCatalog(): Promise<Catalog> {
    const base = await this.base.listCatalog();
    const overrides = await this.overridesReady();
    const replaced = new Map<string, Entity>();
    for (const [, state] of overrides) {
      if (state.kind !== 'entity') continue;
      const entity = (state as DraftEntityState).entity;
      replaced.set(entity.slug, entity);
    }
    if (replaced.size === 0) return base;
    return { entities: base.entities.filter((entity) => !replaced.has(entity.slug)).concat([...replaced.values()]) } satisfies Catalog;
  }

  async getEntity(type: EntityType, slug: string): Promise<Entity | null> {
    const catalog = await this.listCatalog();
    return catalog.entities.find((entity) => entity.type === type && entity.slug === slug) ?? null;
  }

  async search(query: string, type: SearchType = 'all'): Promise<SearchHit[]> {
    const [articles, catalog] = await Promise.all([this.listArticles(), this.listCatalog()]);
    const { searchCatalog } = await import('./present');
    return searchCatalog(articles, catalog, query, type, { ageVerified: false, nsfw: false, discreet: false, blur: false, seed: 1 });
  }
}
