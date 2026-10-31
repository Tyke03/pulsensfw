import type { Entity, EntityFact, EntityType, Pricing } from './entity-schema';

export const TOPICS = ['stars', 'sites', 'ai', 'toys', 'vr', 'guides', 'lists', 'news'] as const;
export type TopicId = (typeof TOPICS)[number];

export const KINDS = ['top_list', 'star_profile', 'site_review', 'review', 'guide', 'news'] as const;
export type Kind = (typeof KINDS)[number];

export const RAIL_IDS = ['trending', 'latest', 'editors', 'guides', 'top10'] as const;
export type RailId = (typeof RAIL_IDS)[number];

export const BADGES = ['new', 'updated'] as const;
export type Badge = (typeof BADGES)[number];

export const LICENSES = [
  'press-kit',
  'affiliate-asset',
  'screenshot',
  'own-art',
  'brand-kit',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'cc-by-3.0',
  'cc-by-sa-2.5',
  'public-domain',
  'example',
] as const;
export type LicenseNote = (typeof LICENSES)[number];

/** Display/search kind. `ai_app` is shown as `ai` to match the nav filter. */
export const ENTITY_KINDS = ['star', 'site', 'product', 'game', 'ai'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const SEARCH_TYPES = ['all', 'article', 'star', 'site', 'product', 'game', 'ai'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * One picture. `explicitId` is a server key, never a public URL.
 * A non-explicit asset is safe to put in HTML. Explicit assets are presented
 * through `presentImage`, which drops the key and the real URL while SFW.
 */
export type RawImage = {
  alt: string;
  url?: string;
  credit?: string;
  sourceUrl?: string;
  license: LicenseNote;
  explicit: boolean;
  explicitId?: string;
  /** Optional 2257 record id when the picture is of a real person. */
  record2257?: string;
  plate?: string;
};

export type Gear = {
  product: string;
  score: number;
  ratings: { label: string; value: number }[];
  specs: { label: string; value: string }[];
  pros: string[];
  cons: string[];
  verdict: string;
};

export type ArticleSource = { label: string; url: string; checked?: string };

export type RawArticle = {
  slug: string;
  title: string;
  dek: string;
  topic: TopicId;
  kind: Kind;
  publishedAt: Date;
  updatedAt?: Date;
  badges: Badge[];
  author: string;
  kicker: string;
  readingMinutes: number;
  placement: 'lead' | 'stack' | 'none';
  rails: RailId[];
  tags: string[];
  /** SFW cover. Required. Explicit stills live in `explicitImages`. */
  cover: RawImage;
  explicitImages: RawImage[];
  /** Entity slugs, in rank order for top lists. */
  entitySlugs: string[];
  sources: ArticleSource[];
  checkedAt?: Date;
  gear?: Gear;
  bodyText: string;
};

export type Subtopic = { id: string; label: string; description: string };

export type Topic = {
  id: TopicId;
  label: string;
  short: string;
  href: string;
  blurb: string;
  subtopics: Subtopic[];
};

export type RawDeal = {
  id: string;
  title: string;
  merchant: string;
  price: string;
  was: string;
  href: string;
  topic: TopicId;
  cover: RawImage;
  note: string;
};

/** The entity collection is the catalog. */
export type Catalog = {
  entities: Entity[];
};

export type MediaView =
  | { state: 'plate'; plate: string; topic: TopicId; alt: string }
  | { state: 'file'; src: string; alt: string }
  | { state: 'explicit'; src: string; alt: string }
  | { state: 'withheld'; src: string; alt: string };

export type ArticleCard = {
  slug: string;
  href: string;
  title: string;
  dek: string;
  topic: TopicId;
  kind: Kind;
  kicker: string;
  author: string;
  publishedLabel: string;
  readingMinutes: number;
  badges: Badge[];
  score: number | null;
  media: MediaView;
};

export type PresentedExplicit = {
  media: MediaView;
  credit?: string;
  sourceUrl?: string;
  license: LicenseNote;
  record2257?: string;
};

export type PresentedEntity = {
  kind: EntityKind;
  type: EntityType;
  slug: string;
  title: string;
  href: string;
  blurb: string;
  topic: TopicId;
  media: MediaView;
};

export type ArticlePage = ArticleCard & {
  tags: string[];
  gear?: Gear;
  updatedLabel?: string;
  checkedLabel?: string;
  explicitMedia: PresentedExplicit[];
  entitySlugs: string[];
  entities: PresentedEntity[];
  sources: ArticleSource[];
};

export type DealCard = {
  id: string;
  title: string;
  merchant: string;
  price: string;
  was: string;
  href: string;
  topic: TopicId;
  note: string;
  media: MediaView;
};

export type EntityCard = {
  kind: EntityKind;
  type: EntityType;
  id: string;
  slug: string;
  href: string;
  title: string;
  dek: string;
  topic: TopicId;
  kicker: string;
  meta: string;
  tags: string[];
  media: MediaView;
  explicitMedia: PresentedExplicit[];
  facts: { label: string; value: string }[];
  score: number | null;
  pricing: Pricing;
  platforms: string[];
  affiliateHref: string | null;
  outboundHref: string;
  updated: string;
  image: Entity['image'];
};

/** Full entity view used by detail pages and article templates. */
export type EntityPage = EntityCard & {
  entity: Entity;
  entityFacts: EntityFact[];
  sources: { label: string; url: string; checked?: string }[];
  relatedArticles: ArticleCard[];
};

export type SearchHit = {
  type: SearchType;
  title: string;
  dek: string;
  href: string;
  topic: TopicId;
  kicker: string;
  media: MediaView;
};

export type ReaderMode = {
  ageVerified: boolean;
  nsfw: boolean;
  discreet: boolean;
  blur: boolean;
  seed: number;
};

export type { Entity, EntityFact, EntityType, Pricing };
