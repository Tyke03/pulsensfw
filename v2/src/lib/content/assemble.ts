import { byDateDesc, entitiesForTopic, hasRealPortrait, presentArticle, presentCatalog, presentDeal } from './present';
import type {
  ArticleCard,
  Catalog,
  DealCard,
  EntityCard,
  RailId,
  RawArticle,
  RawDeal,
  ReaderMode,
  Topic,
} from './types';

export type HomeModel = {
  lead: ArticleCard;
  stack: ArticleCard[];
  desk: ArticleCard[];
  rails: Record<RailId, ArticleCard[]>;
  topics: Topic[];
  deals: DealCard[];
  rising: EntityCard[];
  trendingStars: EntityCard[];
  aiApps: EntityCard[];
  sites: EntityCard[];
};

const RAILS: RailId[] = ['trending', 'latest', 'editors', 'guides', 'top10'];

export function assembleHome(
  articles: RawArticle[],
  topics: Topic[],
  deals: RawDeal[],
  catalog: Catalog,
  reader: ReaderMode,
): HomeModel {
  const ordered = [...articles].sort(byDateDesc);
  const leadRaw = ordered.find((article) => article.placement === 'lead') ?? ordered[0];
  if (!leadRaw) {
    throw new Error('Seed content has no articles.');
  }
  const stackRaw = ordered.filter((article) => article.placement === 'stack').slice(0, 3);
  const used = new Set([leadRaw.slug, ...stackRaw.map((article) => article.slug)]);
  const desk = ordered.filter((article) => !used.has(article.slug)).slice(0, 4).map((article) => presentArticle(article, reader));
  const rails = {
    trending: [],
    latest: [],
    editors: [],
    guides: [],
    top10: [],
  } as Record<RailId, ArticleCard[]>;
  for (const id of RAILS) {
    rails[id] = ordered
      .filter((article) => article.rails.includes(id))
      .slice(0, 8)
      .map((article) => presentArticle(article, reader));
  }
  const entities = presentCatalog(catalog, reader);
  const populatedTopics = topics.filter((topic) => {
    const hasStories = ordered.some((article) => article.topic === topic.id || article.tags.some((tag) => tag.toLowerCase() === topic.id));
    const hasEntities = entitiesForTopic(catalog, topic.id, null, reader).length > 0;
    return hasStories || hasEntities;
  });
  return {
    lead: presentArticle(leadRaw, reader),
    stack: stackRaw.map((article) => presentArticle(article, reader)),
    desk,
    rails,
    topics: populatedTopics.length > 0 ? populatedTopics : topics,
    deals: deals.map((deal) => presentDeal(deal, reader)),
    rising: entities
      .filter((card) => card.type === 'star' && card.tags.includes('rising'))
      .sort((a, b) => Number(hasRealPortrait(b)) - Number(hasRealPortrait(a)) || b.updated.localeCompare(a.updated))
      .slice(0, 8),
    trendingStars: entities
      .filter((card) => card.type === 'star')
      .sort((a, b) => Number(hasRealPortrait(b)) - Number(hasRealPortrait(a)) || (b.score ?? 0) - (a.score ?? 0) || b.updated.localeCompare(a.updated))
      .slice(0, 10),
    aiApps: entities
      .filter((card) => card.type === 'ai_app' || card.type === 'frontend')
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title))
      .slice(0, 10),
    sites: entities
      .filter((card) => card.type === 'site')
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title))
      .slice(0, 8),
  };
}

export function relatedArticles(articles: RawArticle[], slug: string, topic: string, reader: ReaderMode): ArticleCard[] {
  return articles
    .filter((article) => article.slug !== slug && article.topic === topic)
    .sort(byDateDesc)
    .slice(0, 3)
    .map((article) => presentArticle(article, reader));
}
