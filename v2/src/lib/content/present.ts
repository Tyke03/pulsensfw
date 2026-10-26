import { presentImage } from './resolve-media';
import { articleHref, formatDate } from './format';
import type {
  ArticleCard,
  ArticlePage,
  Catalog,
  DealCard,
  EntityCard,
  EntityKind,
  PresentedEntry,
  PresentedExplicit,
  RawArticle,
  RawDeal,
  RawGame,
  RawImage,
  RawPlatform,
  RawProduct,
  RawSite,
  RawStar,
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

export function presentArticle(article: RawArticle, reader: ReaderMode, catalog?: Catalog): ArticlePage {
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
    score: article.gear?.score ?? null,
    media: presentImage(article.cover, article.topic, `story:${article.slug}`, reader),
    example: true,
  };
  return {
    ...card,
    tags: article.tags,
    gear: article.gear,
    updatedLabel: article.updatedAt ? formatDate(article.updatedAt) : undefined,
    explicitMedia: explicitViews(article.explicitImages, article.topic, `story:${article.slug}`, reader),
    entries: catalog ? presentEntries(article, catalog, reader) : [],
  };
}

export function presentEntries(article: RawArticle, catalog: Catalog, reader: ReaderMode): PresentedEntry[] {
  return article.entries.flatMap((entry) => {
    const card = findPresented(catalog, entry.kind, entry.id, reader);
    if (!card) return [];
    return [{
      kind: entry.kind,
      id: entry.id,
      title: card.title,
      href: card.href,
      blurb: entry.blurb,
      topic: card.topic,
      media: card.media,
    }];
  });
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

function starCard(star: RawStar, reader: ReaderMode): EntityCard {
  return {
    kind: 'star',
    id: star.id,
    href: `/stars/${star.id}`,
    title: star.name,
    dek: star.dek,
    topic: 'stars',
    kicker: star.rising ? 'New & rising' : 'Star',
    meta: star.platforms.join(' · '),
    tags: star.niches,
    media: presentImage(star.cover, 'stars', `star:${star.id}`, reader),
    explicitMedia: explicitViews(star.explicitImages, 'stars', `star:${star.id}`, reader),
    facts: [
      { label: 'Platforms', value: star.platforms.join(', ') },
      { label: 'Niches', value: star.niches.join(', ') },
      { label: 'Status', value: [star.trending ? 'Trending' : '', star.rising ? 'Rising' : ''].filter(Boolean).join(' · ') || 'On the desk' },
    ],
  };
}

function siteCard(site: RawSite, reader: ReaderMode): EntityCard {
  return {
    kind: 'site',
    id: site.id,
    href: `/sites/${site.id}`,
    title: site.name,
    dek: site.dek,
    topic: 'sites',
    kicker: site.siteKind,
    meta: site.tags.join(' · '),
    tags: site.tags,
    media: presentImage(site.cover, 'sites', `site:${site.id}`, reader),
    explicitMedia: explicitViews(site.explicitImages, 'sites', `site:${site.id}`, reader),
    facts: [
      { label: 'Kind', value: site.siteKind },
      { label: 'Best for', value: site.tags.join(', ') },
    ],
  };
}

function productCard(product: RawProduct, reader: ReaderMode): EntityCard {
  return {
    kind: 'product',
    id: product.id,
    href: `/products/${product.id}`,
    title: product.name,
    dek: product.dek,
    topic: 'toys',
    kicker: 'Toy',
    meta: product.price,
    tags: product.tags,
    media: presentImage(product.cover, 'toys', `product:${product.id}`, reader),
    explicitMedia: explicitViews(product.explicitImages, 'toys', `product:${product.id}`, reader),
    facts: [
      { label: 'Example price', value: product.price },
      { label: 'Tags', value: product.tags.join(', ') },
    ],
  };
}

function gameCard(game: RawGame, reader: ReaderMode): EntityCard {
  return {
    kind: 'game',
    id: game.id,
    href: `/games/${game.id}`,
    title: game.name,
    dek: game.dek,
    topic: 'vr',
    kicker: 'Game',
    meta: game.platform,
    tags: game.tags,
    media: presentImage(game.cover, 'vr', `game:${game.id}`, reader),
    explicitMedia: explicitViews(game.explicitImages, 'vr', `game:${game.id}`, reader),
    facts: [
      { label: 'Plays on', value: game.platform },
      { label: 'Tags', value: game.tags.join(', ') },
    ],
  };
}

function platformCard(platform: RawPlatform, reader: ReaderMode): EntityCard {
  return {
    kind: 'ai',
    id: platform.id,
    href: `/platforms/${platform.id}`,
    title: platform.name,
    dek: platform.dek,
    topic: 'ai',
    kicker: 'AI',
    meta: platform.focus,
    tags: platform.tags,
    media: presentImage(platform.cover, 'ai', `ai:${platform.id}`, reader),
    explicitMedia: explicitViews(platform.explicitImages, 'ai', `ai:${platform.id}`, reader),
    facts: [
      { label: 'Focus', value: platform.focus },
      { label: 'Tags', value: platform.tags.join(', ') },
    ],
  };
}

export function presentCatalog(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  return [
    ...catalog.stars.map((star) => starCard(star, reader)),
    ...catalog.sites.map((site) => siteCard(site, reader)),
    ...catalog.products.map((product) => productCard(product, reader)),
    ...catalog.games.map((game) => gameCard(game, reader)),
    ...catalog.platforms.map((platform) => platformCard(platform, reader)),
  ];
}

export function findPresented(catalog: Catalog, kind: EntityKind, id: string, reader: ReaderMode): EntityCard | null {
  return presentCatalog(catalog, reader).find((card) => card.kind === kind && card.id === id) ?? null;
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
    const source = card.kind === 'star'
      ? catalog.stars.find((item) => item.id === card.id)
      : card.kind === 'site'
        ? catalog.sites.find((item) => item.id === card.id)
        : card.kind === 'product'
          ? catalog.products.find((item) => item.id === card.id)
          : card.kind === 'game'
            ? catalog.games.find((item) => item.id === card.id)
            : catalog.platforms.find((item) => item.id === card.id);
    const extra = source
      ? [
          'platforms' in source ? source.platforms.join(' ') : '',
          'niches' in source ? source.niches.join(' ') : '',
          'tags' in source ? source.tags.join(' ') : '',
          'siteKind' in source ? source.siteKind : '',
          'focus' in source ? source.focus : '',
          'platform' in source ? source.platform : '',
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

const TOPIC_KIND: Partial<Record<TopicId, EntityKind>> = {
  stars: 'star',
  sites: 'site',
  ai: 'ai',
  toys: 'product',
  vr: 'game',
};

export function entitiesForTopic(catalog: Catalog, topic: TopicId, filter: string | null, reader: ReaderMode): EntityCard[] {
  const kind = TOPIC_KIND[topic];
  if (!kind) return [];
  return presentCatalog(catalog, reader).filter((card) => {
    if (card.kind !== kind) return false;
    if (!filter) return true;
    if (filter === 'rising') return card.kicker === 'New & rising' || card.tags.includes('rising');
    if (card.kind === 'site') return card.kicker === filter || card.tags.includes(filter);
    return card.tags.includes(filter);
  });
}

export function risingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  return entitiesForTopic(catalog, 'stars', 'rising', reader);
}

export function trendingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  return presentCatalog(catalog, reader).filter((card) => (
    card.kind === 'star' && card.facts.some((fact) => fact.label === 'Status' && fact.value.includes('Trending'))
  ));
}

export function byDateDesc(a: RawArticle, b: RawArticle): number {
  return b.publishedAt.getTime() - a.publishedAt.getTime();
}
