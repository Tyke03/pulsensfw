import { entityHasActiveAffiliate, goHref } from '../affiliates/registry';
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
  routeTypes,
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

function formatCardMeta(entity: Entity): string {
  if (entity.platforms.length === 0) {
    if (entity.type === 'star' && /^Personal brand/i.test(entity.pricing.model)) {
      return entity.tags.includes('creator') ? 'Independent creator' : 'Verified performer';
    }
    return pricingSummary(entity.pricing);
  }
  const cleaned = entity.platforms
    .map((entry) => {
      const trimmed = entry.trim();
      if (/not verified/i.test(trimmed)) return '';
      return trimmed.replace(/\s*[—–-]\s*https?:\/\/\S+/gi, '').trim();
    })
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  if (unique.length > 0) return unique.join(' · ');
  if (entity.type === 'star') {
    return entity.tags.includes('creator') ? 'Independent creator' : 'Verified performer profile';
  }
  return pricingSummary(entity.pricing);
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
    meta: formatCardMeta(entity),
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
    affiliateHref: entityHasActiveAffiliate(entity) ? goHref(entity.slug, { slot: 'dossier' }) : null,
    outboundHref: entityHasActiveAffiliate(entity) ? goHref(entity.slug, { slot: 'dossier' }) : entity.url,
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
  for (const type of routeTypes(kind)) {
    const entity = findEntity(catalog, type, id);
    if (entity) return presentEntity(entity, reader);
  }
  return null;
}

function hit(card: { title: string; dek: string; href: string; topic: TopicId; kicker: string; media: SearchHit['media'] }, type: SearchType): SearchHit {
  return { type, title: card.title, dek: card.dek, href: card.href, topic: card.topic, kicker: card.kicker, media: card.media };
}

const SEARCH_MODIFIERS = new Set([
  'a', 'an', 'and', 'best', 'for', 'from', 'in', 'me', 'my', 'of', 'on', 'or',
  'rated', 'review', 'reviews', 'show', 'the', 'to', 'top', 'with',
  'site', 'sites', 'star', 'stars', 'toy', 'toys', 'game', 'games',
]);

const SEARCH_TYPE_HINTS: Array<{ tokens: readonly string[]; type: SearchType }> = [
  { tokens: ['site', 'sites', 'tube', 'tubes', 'cam', 'cams', 'webcam', 'paysite', 'studio', 'hentai', 'erotica'], type: 'site' },
  { tokens: ['star', 'stars', 'pornstar', 'pornstars', 'performer', 'performers', 'actress', 'actor'], type: 'star' },
  { tokens: ['toy', 'toys', 'stroker', 'vibrator', 'wand', 'haptics'], type: 'product' },
  { tokens: ['game', 'games'], type: 'game' },
  { tokens: ['ai', 'chatbot', 'chatbots', 'llm', 'gguf'], type: 'ai' },
];

const SEARCH_SYNONYMS: Record<string, readonly string[]> = {
  cam: ['cam', 'cams', 'webcam', 'camming'],
  cams: ['cams', 'cam', 'webcam', 'camming'],
  webcam: ['webcam', 'cams', 'cam', 'camming'],
  tube: ['tube', 'tubes'],
  tubes: ['tubes', 'tube'],
  toy: ['toy', 'toys', 'vibrator', 'stroker', 'wand', 'haptics'],
  toys: ['toys', 'toy', 'vibrator', 'stroker', 'wand', 'haptics'],
  vibrator: ['vibrator', 'wand', 'air-pulse', 'rabbit', 'bullet'],
  star: ['star', 'stars', 'performer', 'actress', 'creator'],
  stars: ['stars', 'star', 'performer', 'actress', 'creator'],
  pornstar: ['pornstar', 'performer', 'hall of fame'],
  pornstars: ['pornstars', 'performer', 'hall of fame'],
  onlyfans: ['onlyfans', 'creator', 'platform'],
  hentai: ['hentai', 'anime', 'doujinshi'],
  anime: ['anime', 'hentai', 'doujinshi'],
  comic: ['comic', 'comics', 'rule34', 'western'],
  comics: ['comics', 'comic', 'rule34', 'western'],
  erotica: ['erotica', 'stories', 'audio', 'literotica'],
  vr: ['vr', 'pcvr', 'quest', 'headsets'],
  ai: ['ai', 'chatbot', 'companion', 'roleplay'],
  chatbot: ['chatbot', 'chat', 'character chat', 'roleplay', 'companion'],
  chatbots: ['chatbots', 'chat', 'character chat', 'roleplay', 'companion'],
  local: ['local', 'offline', 'gguf'],
  free: ['free', 'open source', 'freemium'],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenMatches(text: string, variant: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(variant)}(?:$|[^a-z0-9])`, 'i');
  return re.test(text);
}

function expandSearchToken(token: string): string[] {
  const out = new Set<string>([token]);
  const syn = SEARCH_SYNONYMS[token];
  if (syn) syn.forEach((word) => out.add(word));
  if (token.length > 3 && token.endsWith('s')) out.add(token.slice(0, -1));
  return [...out];
}

export function searchCatalog(
  articles: RawArticle[],
  catalog: Catalog,
  query: string,
  type: SearchType,
  reader: ReaderMode,
): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const rawTokens = needle.split(/[^a-z0-9.+_-]+/).filter(Boolean);
  const hintTypes = new Set<SearchType>();
  for (const raw of rawTokens) {
    for (const h of SEARCH_TYPE_HINTS) {
      if (h.tokens.includes(raw)) hintTypes.add(h.type);
    }
  }
  const strongTokens = rawTokens.filter((token) => !SEARCH_MODIFIERS.has(token));
  const tokens = strongTokens.length > 0 ? strongTokens : rawTokens;
  const entities = presentCatalog(catalog, reader);

  const articleItems = articles.map((article) => {
    const view = presentArticle(article, reader);
    const titleText = `${article.title} ${article.kicker} ${article.topic}`.toLowerCase();
    const tagList = [...article.tags, article.kind, article.topic].map((t) => t.toLowerCase());
    const tagText = tagList.join(' ');
    const bodyText = `${article.dek} ${article.bodyText}`.toLowerCase();
    return {
      titleText,
      tagText,
      tagList,
      fullText: `${titleText} ${tagText} ${bodyText}`,
      rating: view.score ?? 0,
      hasPhoto: view.media.state === 'file',
      hit: hit(view, 'article'),
    };
  });

  const entityItems = entities.map((card) => {
    const source = catalog.entities.find((entity) => entity.slug === card.slug);
    const titleText = `${card.title} ${card.slug.replaceAll('-', ' ')} ${card.kicker}`.toLowerCase();
    const tagList = [...card.tags, card.topic, card.kicker].map((t) => t.toLowerCase());
    const tagText = `${tagList.join(' ')} ${card.meta}`.toLowerCase();
    const extra = source
      ? [
          source.platforms.join(' '),
          source.facts.map((fact) => `${fact.key} ${fact.value}`).join(' '),
        ].join(' ')
      : '';
    const fullText = `${titleText} ${tagText} ${card.dek} ${extra}`.toLowerCase();
    return {
      titleText,
      tagText,
      tagList,
      fullText,
      rating: card.score ?? 0,
      hasPhoto: hasRealPortrait(card),
      hit: hit(card, card.kind),
    };
  });

  const pool = [...entityItems, ...articleItems].filter((item) => (type === 'all' ? true : item.hit.type === type));
  if (!needle) return pool.slice(0, 24).map((item) => item.hit);

  const scored = pool
    .map((item) => {
      let matchedTokens = 0;
      let rankScore = 0;
      let strongHit = false;
      if (item.titleText.includes(needle)) {
        rankScore += 140;
        strongHit = true;
      }

      for (const token of tokens) {
        const variants = expandSearchToken(token);
        const inTitle = variants.some((v) => tokenMatches(item.titleText, v));
        const inTags = variants.some((v) => item.tagList.some((tag) => tokenMatches(tag, v)));
        const inBody = variants.some((v) => tokenMatches(item.fullText, v));
        if (inTitle || inTags || inBody) {
          matchedTokens += 1;
          if (inTitle) {
            rankScore += 65;
            strongHit = true;
          } else if (inTags) {
            rankScore += 45;
            strongHit = true;
          } else {
            rankScore += 8;
          }
        }
      }
      if (matchedTokens === 0) return null;
      if (matchedTokens === tokens.length) rankScore += 55;
      if (type === 'all' && hintTypes.size > 0) {
        if (hintTypes.has(item.hit.type)) rankScore += 65;
        else rankScore -= 25;
      }
      rankScore += item.rating * 1.5 + (item.hasPhoto ? 4 : 0);
      return { item, matchedTokens, rankScore, strongHit };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const allMatched = scored.filter((entry) => entry.matchedTokens === tokens.length);
  const candidates = allMatched.length > 0 ? allMatched : scored;
  const strongOnly = candidates.filter((entry) => entry.strongHit);
  const finalSet = strongOnly.length >= 6 ? strongOnly : candidates;

  return finalSet
    .sort((a, b) => b.matchedTokens - a.matchedTokens || b.rankScore - a.rankScore || a.item.hit.title.localeCompare(b.item.hit.title))
    .slice(0, 24)
    .map((entry) => entry.item.hit);
}

const TOPIC_TYPE: Partial<Record<TopicId, EntityType>> = {
  stars: 'star',
  sites: 'site',
  ai: 'ai_app',
  toys: 'product',
  vr: 'game',
};

const SUBTOPIC_ALIASES: Record<string, readonly string[]> = {
  chat: ['chat', 'character chat', 'companion', 'roleplay', 'character cards', 'storytelling', 'multi-character'],
  image: ['image', 'image generation', 'video', 'generator'],
  privacy: ['privacy', 'local', 'unlogged'],
  local: ['local', 'offline', 'gguf', 'power user'],
  scenes: ['scenes', 'vr', 'studio', 'aggregator', 'streaming'],
  games: ['games', 'game'],
  headsets: ['headsets', 'headset', 'vr'],
  haptics: ['haptics', 'scripts', 'sync'],
  premium: ['premium', 'paysite', 'exclusive'],
  tube: ['tube', 'tubes'],
  cams: ['cams', 'cam', 'live', 'tokens', 'roulette', 'private-shows'],
  platform: ['platform', 'onlyfans', 'creator', 'clips'],
  niche: ['niche', 'fetish', 'bdsm', 'queer', 'alt'],
  hentai: ['hentai', 'anime', 'doujinshi', 'manga'],
  comics: ['comics', 'comic', 'rule34', 'furry', 'western', '3d'],
  erotica: ['erotica', 'stories', 'audio', 'fiction'],
  forums: ['forums', 'forum', 'aggregator', 'directory', 'database'],
  rising: ['rising', 'newcomer', 'breakout'],
  vr: ['vr', 'vr performer', 'scripts'],
  solo: ['solo', 'creator', 'onlyfans'],
  couples: ['couples', 'girl-girl', 'wearable'],
  wands: ['wands', 'wand', 'cordless'],
  quiet: ['quiet', 'air-pulse', 'sonic', 'whisper'],
  app: ['app', 'haptics', 'bluetooth', 'scripts'],
};

export function matchesSubtopicFilter(tags: readonly string[], filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  const aliases = SUBTOPIC_ALIASES[needle] ?? [needle];
  const lowered = tags.map((tag) => tag.toLowerCase());
  return lowered.some((tag) => aliases.includes(tag));
}

export function hasRealPortrait(card: EntityCard): boolean {
  return Boolean(card.image?.src) && card.image?.license !== 'brand-kit';
}

export function isVeteranStar(card: EntityCard): boolean {
  const lowered = card.tags.map((t) => t.toLowerCase());
  return lowered.includes('hall of fame') || lowered.includes('veteran') || lowered.includes('former performer');
}

export function entitiesForTopic(catalog: Catalog, topic: TopicId, filter: string | null, reader: ReaderMode): EntityCard[] {
  const type = TOPIC_TYPE[topic];
  if (!type) return [];
  const items = presentCatalog(catalog, reader).filter((card) => {
    const belongs = entityTopic(card.type) === topic || (topic === 'vr' && card.type === 'site' && card.tags.some((tag) => tag.toLowerCase() === 'vr'));
    if (!belongs) return false;
    if (!filter) return true;
    return matchesSubtopicFilter(card.tags, filter);
  });
  if (topic === 'stars') return items.sort(creatorsFirst);
  return items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title));
}

/** Stars page mix: real photographs first, active creators/performers, then award-circuit vets; alphabetical stability. */
function creatorsFirst(a: EntityCard, b: EntityCard): number {
  const ap = hasRealPortrait(a) ? 0 : 1;
  const bp = hasRealPortrait(b) ? 0 : 1;
  if (ap !== bp) return ap - bp;
  const av = isVeteranStar(a) ? 1 : 0;
  const bv = isVeteranStar(b) ? 1 : 0;
  if (av !== bv) return av - bv;
  const ac = a.tags.includes('creator') ? 0 : 1;
  const bc = b.tags.includes('creator') ? 0 : 1;
  return ac - bc || a.title.localeCompare(b.title);
}

export function risingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  const stars = presentCatalog(catalog, reader).filter((card) => card.type === 'star');
  return stars
    .filter((card) => !isVeteranStar(card) && (card.tags.includes('rising') || card.tags.includes('newcomer') || card.tags.includes('breakout')))
    .sort((a, b) => Number(hasRealPortrait(b)) - Number(hasRealPortrait(a)) || b.platforms.length - a.platforms.length || a.title.localeCompare(b.title))
    .slice(0, 12);
}

function starPopularityRank(card: EntityCard): number {
  let pts = hasRealPortrait(card) ? 100 : 0;
  if (!isVeteranStar(card)) pts += 40;
  if (card.tags.includes('onlyfans') || card.tags.includes('creator')) pts += 18;
  if (card.tags.includes('awards')) pts += 12;
  if (card.tags.includes('vr')) pts += 10;
  pts += Math.min(8, card.platforms.length * 2);
  return pts;
}

export function trendingStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  const risingSlugs = new Set(risingStars(catalog, reader).map((card) => card.slug));
  const stars = presentCatalog(catalog, reader).filter((card) => card.type === 'star' && !risingSlugs.has(card.slug));
  const activePool = stars.filter((card) => !isVeteranStar(card));
  const pool = activePool.length >= 8 ? activePool : stars.filter((card) => !card.tags.includes('former performer'));
  return pool
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || starPopularityRank(b) - starPopularityRank(a) || a.title.localeCompare(b.title))
    .slice(0, 12);
}

const ICON_PROMINENCE_ORDER = [
  'angela-white', 'lisa-ann', 'jenna-jameson', 'riley-reid', 'sasha-grey',
  'asa-akira', 'alexis-texas', 'tori-black', 'brandi-love', 'julia-ann',
  'nina-hartley', 'tera-patrick', 'manuel-ferrara', 'rocco-siffredi', 'kylie-ireland',
  'briana-banks', 'stormy-daniels', 'abella-danger', 'mia-malkova', 'johnny-sins',
] as const;

export function iconStars(catalog: Catalog, reader: ReaderMode): EntityCard[] {
  const exclude = new Set([
    ...risingStars(catalog, reader).map((card) => card.slug),
    ...trendingStars(catalog, reader).map((card) => card.slug),
  ]);
  const stars = presentCatalog(catalog, reader).filter((card) => card.type === 'star' && isVeteranStar(card) && !exclude.has(card.slug));
  const pool = stars.length >= 6
    ? stars
    : presentCatalog(catalog, reader).filter((card) => card.type === 'star' && isVeteranStar(card));
  const idxMap = new Map<string, number>(ICON_PROMINENCE_ORDER.map((s, i) => [s, i]));
  return pool
    .sort((a, b) => {
      const ap = hasRealPortrait(a) ? 0 : 1;
      const bp = hasRealPortrait(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ar = idxMap.get(a.slug) ?? 999;
      const br = idxMap.get(b.slug) ?? 999;
      if (ar !== br) return ar - br;
      const ah = a.tags.includes('hall of fame') ? 0 : 1;
      const bh = b.tags.includes('hall of fame') ? 0 : 1;
      return ah - bh || b.facts.length - a.facts.length || a.title.localeCompare(b.title);
    })
    .slice(0, 12);
}

export type SiteSpotlight = {
  id: string;
  title: string;
  href: string;
  count: number;
  items: EntityCard[];
};

const SITE_SPOTLIGHT_DEFS: Array<{ id: string; title: string }> = [
  { id: 'tube', title: 'Free Tubes' },
  { id: 'cams', title: 'Live Cams' },
  { id: 'platform', title: 'OF-Style & Creators' },
  { id: 'premium', title: 'Premium Studios' },
  { id: 'hentai', title: 'Hentai & Anime' },
  { id: 'comics', title: 'Comics & Rule34' },
  { id: 'erotica', title: 'Erotica & Audio' },
  { id: 'niche', title: 'Fetish & Niche' },
  { id: 'vr', title: 'VR Studios' },
  { id: 'forums', title: 'Forums & Aggregators' },
];

export function siteSpotlights(catalog: Catalog, reader: ReaderMode): SiteSpotlight[] {
  const sites = presentCatalog(catalog, reader)
    .filter((card) => card.type === 'site')
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title));
  const used = new Set<string>();
  return SITE_SPOTLIGHT_DEFS
    .map((def) => {
      const matching = sites.filter((card) => matchesSubtopicFilter(card.tags, def.id));
      const fresh = matching.filter((card) => !used.has(card.slug));
      const chosen = (fresh.length >= 4 ? fresh : matching).slice(0, 5);
      chosen.forEach((c) => used.add(c.slug));
      return {
        id: def.id,
        title: def.title,
        href: `/sites?topic=${def.id}`,
        count: matching.length,
        items: chosen,
      };
    })
    .filter((shelf) => shelf.count > 0);
}

export function byDateDesc(a: RawArticle, b: RawArticle): number {
  return b.publishedAt.getTime() - a.publishedAt.getTime();
}

export { asDate };
