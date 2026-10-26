export const TOPICS = ['stars', 'sites', 'ai', 'toys', 'vr', 'guides', 'lists', 'news'] as const;
export type TopicId = (typeof TOPICS)[number];

export const KINDS = ['review', 'guide', 'news', 'list', 'comparison'] as const;
export type Kind = (typeof KINDS)[number];

export const RAIL_IDS = ['trending', 'latest', 'editors', 'guides', 'top10'] as const;
export type RailId = (typeof RAIL_IDS)[number];

export const BADGES = ['new', 'updated'] as const;
export type Badge = (typeof BADGES)[number];

export const LICENSES = ['press-kit', 'affiliate-asset', 'screenshot', 'own-art', 'example'] as const;
export type LicenseNote = (typeof LICENSES)[number];

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
  /** Optional 2257 record id when the picture is of a real person. Example art leaves this off. */
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

export type ListEntryRef = {
  kind: EntityKind;
  id: string;
  blurb: string;
};

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
  entries: ListEntryRef[];
  gear?: Gear;
  bodyText: string;
  example: true;
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

export type RawStar = {
  id: string;
  name: string;
  dek: string;
  platforms: string[];
  niches: string[];
  trending: boolean;
  rising: boolean;
  cover: RawImage;
  explicitImages: RawImage[];
  example: true;
};

export type RawSite = {
  id: string;
  name: string;
  dek: string;
  siteKind: 'premium' | 'tube' | 'cams' | 'platform' | 'niche';
  tags: string[];
  cover: RawImage;
  explicitImages: RawImage[];
  example: true;
};

export type RawProduct = {
  id: string;
  name: string;
  dek: string;
  tags: string[];
  price: string;
  cover: RawImage;
  explicitImages: RawImage[];
  example: true;
};

export type RawGame = {
  id: string;
  name: string;
  dek: string;
  tags: string[];
  platform: string;
  cover: RawImage;
  explicitImages: RawImage[];
  example: true;
};

export type RawPlatform = {
  id: string;
  name: string;
  dek: string;
  tags: string[];
  focus: string;
  cover: RawImage;
  explicitImages: RawImage[];
  example: true;
};

export type Catalog = {
  stars: RawStar[];
  sites: RawSite[];
  products: RawProduct[];
  games: RawGame[];
  platforms: RawPlatform[];
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
  example: true;
};

export type PresentedExplicit = {
  media: MediaView;
  credit?: string;
  sourceUrl?: string;
  license: LicenseNote;
  record2257?: string;
};

export type PresentedEntry = {
  kind: EntityKind;
  id: string;
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
  explicitMedia: PresentedExplicit[];
  entries: PresentedEntry[];
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
  id: string;
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
