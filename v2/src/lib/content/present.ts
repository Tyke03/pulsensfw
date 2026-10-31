import { presentImage } from './resolve-media';
import { articleHref, formatDate } from './format';
import {
  ENTITY_LABEL,
  entityHref,
  entityKind,
  entityTopic,
  entityToRawImage,
  entitySources,
  findEntity,
  findEntityBySlug,
  lastCheckedLabel,
  pricingSummary,
} from './entities';
import type { Entity, EntityType } from './entity-schema';
import type {
  ArticleCard,
  ArticlePage,
  Catalog,
  DealCard,
  EntityCard,
  EntityKind,
  EntityPage,
  PresentedEntity,
  PresentedExplicit,
  RawArticle,
  RawDeal,
  RawImage,
  ReaderMode,
  SearchHit,
  SearchType,
  TopicId,
} from './types';

function explicitViews(images: RawImage[], topic: TopicId, key: string, reader: ReaderMode): PresentedExplicit[] {
  return images.map((image, index) => ({
    media: presentImage(image, topic, `${key}:x:${index}`, reader),
    credit: image.credit,
    sourceUrl: image.sourceUrl,
    license: image.license,
    record2257: reader.nsfw ? image.record2257 : undefined,
  }));
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function presentEntity(entity: Entity, reader: ReaderMode): EntityCard {
  const topic = entityTopic(entity.type);
  const kind = entityKind(entity.type);
  return {
    kind,
    type: entity.type,
    id: entity.slug,
    slug: entity.slug,
    href: entityHref(entity.type, entity.slug),
    title: entity.name,
    dek: entity.summary,
    topic,
    kicker: ENTITY_LABEL[entity.type],
    meta: entity.platforms.length > 0 ? entity.platforms.join(' · ') : pricingSummary(entity.pricing),
    tags: entity.tags,
    media: presentImage(entityToRawImage(entity), topic, `entity:${entity.type}:${entity.slug}`, reader),
    explicitMedia: [],
    facts: [
      { label: 'Platforms', value: entity.platforms.join(', ') || '—' },
      ...(entity.score !== null ? [{ label: 'Score', value: `${entity.score.toFixed(1)} / 10` }] : []),
      { label: 'Pricing', value: pricingSummary(entity.pricing) },
      { label: 'Last checked', value: lastCheckedLabel(entity.updated) },
    ],
    score: entity.score,
    pricing: entity.pricing,
    platforms: entity.platforms,
    affiliateHref: entity.affiliate_status === 'active' ? entity.affiliate_url : null,
    outboundHref: entity.affiliate_status === 'active' && entity.affiliate_url ? entity.affiliate_url : entity.url,
    updated: entity.updated,
    image: entity.image,
  };
}

export function presentArticle(article: RawArticle, reader: ReaderMode, catalog?: Catalog): ArticlePage {
  const entities = catalog
    ? article.entitySlugs.flatMap((slug) => {
        const entity = findEntityBySlug(catalog, slug);
        if (!entity) return [];
        return [{
          kind: entityKind(entity.type),
          type: entity.type,
          slug: entity.slug,
          title: entity.name,
          href: entityHref(entity.type, entity.slug),
          blurb: entity.summary,
          topic: entityTopic(entity.type),
          media: presentImage(entityToRawImage(entity), entityTopic(entity.type), `entity:${entity.type}:${entity.slug}`, reader),
        } satisfies PresentedEntity];
      })
    : [];
  const firstScore = entities.length > 0
    ? catalog?.entities.find((entity) => entity.slug === article.entitySlugs[0])?.score ?? null
    : null;
  const card: ArticleCard = {
    slug: article.slug,
    href: articleHref(article.slug),
    title: article.title,
    dek: article.dek,
    topic: article.topic,
    kind: article.kind,
    kicker: article.kicker,
    author: article.author,
    publishedLabel: formatDate(article.publishedAt),
    readingMinutes: article.readingMinutes,
    badges: article.badges,
    score: article.gear?.score ?? firstScore,
    media: presentImage(article.cover, article.topic, `story:${article.slug}`, reader),
  };
  return {
    ...card,
    tags: article.tags,
    gear: article.gear,
    updatedLabel: article.updatedAt ? formatDate(article.updatedAt) : undefined,
    checkedLabel: article.checkedAt ? formatDate(article.checkedAt) : undefined,
    explicitMedia: explicitViews(article.explicitImages, article.topic, `story:${article.slug}`, reader),
    entitySlugs: article.entitySlugs,
    entities,
    sources: article.sources,
  };
}

export function presentEntityPage(
  entity: Entity,
  catalog: Catalog,
  articles: RawArticle[],
  reader: ReaderMode,
): EntityPage {
  const card = presentEntity(entity, reader);
  const relatedArticles = articles
    .filter((article) => article.entitySlugs.includes(entity.slug))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 4)
    .map((article) => presentArticle(article, reader, catalog));
  return {
    ...card,
    entity,
    entityFacts: entity.facts,
    sources: [{ label: entity.name, url: entity.url, checked: entity.updated }, ...entitySources(entity)],
    relatedArticles,
  };
}

export function presentDeal(deal: RawDeal, reader: ReaderMode): DealCard {
  return {
    id: deal.id,
    title: deal.title,
    merchant: deal.merchant,
    price: deal.price,
    was: deal.was,
    href: deal.href,
    topic: deal.topic,
    note: deal.note,
    media: presentImage(deal.cover, deal.topic, `deal:${deal.id}`, reader),
  };
}

export function presentCatalog(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  return catalog.entities.map((entity) => presentEntity(entity, reader));
}

export function findPresented(catalog: Catalog, kind: EntityKind, id: string, reader: ReaderMode): EntityCard | null {
  const type: EntityType = kind === 'ai' ? 'ai_app' : kind;
  const entity = findEntity(catalog, type, id);
  return entity ? presentEntity(entity, reader) : null;
}

function hit(card: { title: string; dek: string; href: string; topic: TopicId; kicker: string; media: SearchHit['media'] }, type: SearchType): SearchHit {
  return { type, title: card.title, dek: card.dek, href: card.href, topic: card.topic, kicker: card.kicker, media: card.media };
}

export function searchCatalog(
  articles: RawArticle[],
  catalog: Catalog,
  query: string,
  type: SearchType,
  reader: ReaderMode,
): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const entities = presentCatalog(catalog, reader);
  const articleHits = articles.map((article) => {
    const view = presentArticle(article, reader);
    const haystack = [article.title, article.dek, article.kicker, article.topic, article.kind, article.tags.join(' '), article.bodyText]
      .join(' ')
      .toLowerCase();
    return { haystack, hit: hit(view, 'article') };
  });
  const entityHits = entities.map((card) => {
    const source = catalog.entities.find((entity) => entity.slug === card.slug);
    const extra = source
      ? [
          source.platforms.join(' '),
          source.tags.join(' '),
          source.facts.map((fact) => `${fact.key} ${fact.value}`).join(' '),
        ].join(' ')
      : '';
    return {
      haystack: `${card.title} ${card.dek} ${card.meta} ${card.tags.join(' ')} ${extra}`.toLowerCase(),
      hit: hit(card, card.kind),
    };
  });
  return [...articleHits, ...entityHits]
    .filter((item) => (type === 'all' ? true : item.hit.type === type))
    .filter((item) => (needle ? item.haystack.includes(needle) : true))
    .slice(0, 24)
    .map((item) => item.hit);
}

const TOPIC_TYPE: Partial<Record<TopicId, EntityType>> = {
  stars: 'star',
  sites: 'site',
  ai: 'ai_app',
  toys: 'product',
  vr: 'game',
};

export function entitiesForTopic(catalog: Catalog, topic: TopicId, filter: string | null, reader: ReaderMode): EntityCard[] {
  const type = TOPIC_TYPE[topic];
  if (!type) return [];
  return presentCatalog(catalog, reader).filter((card) => {
    if (card.type !== type) return false;
    if (!filter) return true;
    if (filter === 'rising') return card.tags.includes('rising');
    return card.tags.includes(filter);
  });
}

/** Stars page mix: creators (OnlyFans/X-style) first, then award-circuit performers; recency within each group. */
function creatorsFirst(a: EntityCard, b: EntityCard): number {
  const ac = a.tags.includes('creator') ? 0 : 1;
  const bc = b.tags.includes('creator') ? 0 : 1;
  return ac - bc || b.updated.localeCompare(a.updated);
}

export function risingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  const stars = presentCatalog(catalog, reader).filter((card) => card.type === 'star');
  const tagged = stars.filter((card) => card.tags.includes('rising'));
  return (tagged.length > 0 ? tagged : stars).sort(creatorsFirst);
}

export function trendingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  const stars = presentCatalog(catalog, reader).filter((card) => card.type === 'star');
  const scored = stars.filter((card) => card.score !== null);
  if (scored.length === 0) return stars.slice(0, 8).sort(creatorsFirst);
  return scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function byDateDesc(a: RawArticle, b: RawArticle): number {
  return b.publishedAt.getTime() - a.publishedAt.getTime();
}

export { asDate };
