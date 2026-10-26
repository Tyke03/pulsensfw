import { getCollection, type CollectionEntry } from 'astro:content';
import dealsJson from '../../content/deals.json';
import gamesJson from '../../content/games.json';
import platformsJson from '../../content/platforms.json';
import productsJson from '../../content/products.json';
import sitesJson from '../../content/sites.json';
import starsJson from '../../content/stars.json';
import topicsJson from '../../content/topics.json';
import { isExplicitId } from '../media/explicit-catalog';
import type { ContentRepository } from './repository';
import { byDateDesc, searchCatalog } from './present';
import type {
  Badge,
  Catalog,
  Kind,
  ListEntryRef,
  RailId,
  RawArticle,
  RawDeal,
  RawGame,
  RawImage,
  RawPlatform,
  RawProduct,
  RawSite,
  RawStar,
  SearchType,
  Topic,
  TopicId,
} from './types';

type ArticleEntry = CollectionEntry<'articles'>;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function imageOf(owner: string, image: RawImage, role: string): RawImage {
  if (role === 'cover' && image.explicit) {
    throw new Error(`${owner} cover is explicit. SFW covers are required.`);
  }
  if (image.explicit && !isExplicitId(image.explicitId)) {
    throw new Error(`${owner} explicit image is missing a catalog id.`);
  }
  return image;
}

export function articleFromEntry(entry: ArticleEntry): RawArticle {
  const data = entry.data;
  const cover = imageOf(entry.id, data.cover as RawImage, 'cover');
  const explicitImages = ((data.explicitImages ?? []) as RawImage[]).map((image, index) => imageOf(`${entry.id}#${index}`, image, 'explicit'));
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
    explicitImages,
    entries: (data.entries ?? []) as ListEntryRef[],
    gear: data.gear,
    bodyText: entry.body ?? '',
    example: true,
  };
}

function assertImages(label: string, images: RawImage[]) {
  images.forEach((image, index) => imageOf(`${label}#${index}`, image, image.explicit ? 'explicit' : 'cover'));
}

const stars = starsJson as RawStar[];
const sites = sitesJson as RawSite[];
const products = productsJson as RawProduct[];
const games = gamesJson as RawGame[];
const platforms = platformsJson as RawPlatform[];
const deals = dealsJson as RawDeal[];

for (const star of stars) assertImages(star.id, [star.cover, ...star.explicitImages]);
for (const site of sites) assertImages(site.id, [site.cover, ...site.explicitImages]);
for (const product of products) assertImages(product.id, [product.cover, ...product.explicitImages]);
for (const game of games) assertImages(game.id, [game.cover, ...game.explicitImages]);
for (const platform of platforms) assertImages(platform.id, [platform.cover, ...platform.explicitImages]);
for (const deal of deals) assertImages(deal.id, [deal.cover]);

const catalog: Catalog = { stars, sites, products, games, platforms };

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
    return deals;
  },
  async listCatalog() {
    return catalog;
  },
  async search(query: string, type: SearchType = 'all') {
    const articles = await this.listArticles();
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
