import { byDateDesc, presentArticle, presentCatalog, presentDeal } from './present';
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
  return {
    lead: presentArticle(leadRaw, reader),
    stack: stackRaw.map((article) => presentArticle(article, reader)),
    desk,
    rails,
    topics,
    deals: deals.map((deal) => presentDeal(deal, reader)),
    rising: entities.filter((card) => card.kind === 'star' && card.kicker === 'New & rising').slice(0, 8),
    trendingStars: entities.filter((card) => card.kind === 'star' && catalog.stars.find((star) => star.id === card.id)?.trending).slice(0, 8),
    sites: entities.filter((card) => card.kind === 'site').slice(0, 8),
  };
}

export function relatedArticles(articles: RawArticle[], slug: string, topic: string, reader: ReaderMode): ArticleCard[] {
  return articles
    .filter((article) => article.slug !== slug && article.topic === topic)
    .sort(byDateDesc)
    .slice(0, 3)
    .map((article) => presentArticle(article, reader));
}
