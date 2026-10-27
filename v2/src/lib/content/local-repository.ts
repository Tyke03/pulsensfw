import { getCollection, type CollectionEntry } from 'astro:content';
import dealsJson from '../../content/deals.json';
import topicsJson from '../../content/topics.json';
import { findEntity } from './entities';
import type { Entity, EntityType } from './entity-schema';
import type { ContentRepository } from './repository';
import { byDateDesc, searchCatalog } from './present';
import type {
  Badge,
  Catalog,
  Kind,
  RailId,
  RawArticle,
  RawDeal,
  RawImage,
  SearchType,
  Topic,
  TopicId,
} from './types';

type ArticleEntry = CollectionEntry<'articles'>;
type EntityEntry = CollectionEntry<'entities'>;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function imageOf(owner: string, image: RawImage, role: string): RawImage {
  if (role === 'cover' && image.explicit) {
    throw new Error(`${owner} cover is explicit. SFW covers are required.`);
  }
  return image;
}

export function articleFromEntry(entry: ArticleEntry): RawArticle {
  const data = entry.data;
  const cover = imageOf(entry.id, data.cover as RawImage, 'cover');
  return {
    slug: entry.id,
    title: data.title,
    dek: data.dek,
    topic: data.topic as TopicId,
    kind: data.kind as Kind,
    publishedAt: asDate(data.publishedAt),
    updatedAt: data.updatedAt ? asDate(data.updatedAt) : undefined,
    badges: (data.badges ?? []) as Badge[],
    author: data.author,
    kicker: data.kicker,
    readingMinutes: data.readingMinutes,
    placement: data.placement,
    rails: (data.rails ?? []) as RailId[],
    tags: data.tags ?? [],
    cover,
    explicitImages: [],
    entitySlugs: data.entities ?? [],
    sources: (data.sources ?? []).map((source) => ({
      label: source.label,
      url: source.url,
      checked: source.checked,
    })),
    checkedAt: data.checkedAt ? asDate(data.checkedAt) : undefined,
    gear: data.gear,
    bodyText: entry.body ?? '',
  };
}

export function entityFromEntry(entry: EntityEntry): Entity {
  return { ...entry.data, slug: entry.id };
}

export const localContentRepository: ContentRepository = {
  info: { source: 'local-seed' },
  async listArticles() {
    const entries = await getCollection('articles');
    return entries.map(articleFromEntry).sort(byDateDesc);
  },
  async getArticle(slug: string) {
    const articles = await this.listArticles();
    return articles.find((article) => article.slug === slug) ?? null;
  },
  async listTopics() {
    return topicsJson as Topic[];
  },
  async listDeals() {
    return dealsJson as RawDeal[];
  },
  async listCatalog() {
    const entries = await getCollection('entities');
    return { entities: entries.map(entityFromEntry) } satisfies Catalog;
  },
  async getEntity(type: EntityType, slug: string) {
    const catalog = await this.listCatalog();
    return findEntity(catalog, type, slug);
  },
  async search(query: string, type: SearchType = 'all') {
    const articles = await this.listArticles();
    const catalog = await this.listCatalog();
    return searchCatalog(articles, catalog, query, type, {
      ageVerified: false,
      nsfw: false,
      discreet: false,
      blur: false,
      seed: 1,
    });
  },
};

export function getContentRepository(): ContentRepository {
  return localContentRepository;
}
