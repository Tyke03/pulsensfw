export const TOPICS = ['vr', 'toys', 'ai-chat', 'creators', 'news', 'guides', 'deals'] as const;
export type TopicId = (typeof TOPICS)[number];

export const KINDS = ['review', 'guide', 'news', 'list', 'comparison'] as const;
export type Kind = (typeof KINDS)[number];

export const RAIL_IDS = ['trending', 'latest', 'editors', 'guides', 'top10'] as const;
export type RailId = (typeof RAIL_IDS)[number];

export const BADGES = ['new', 'updated'] as const;
export type Badge = (typeof BADGES)[number];

/** Stored image. `explicitId` is a server-side key, never a public URL. */
export type RawImage = {
  alt: string;
  plate: string;
  explicit: boolean;
  explicitId?: string;
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
  image: RawImage;
  gear?: Gear;
  /** Raw markdown for search. Not rendered as HTML by the repository. */
  bodyText: string;
  example: true;
};

export type Subtopic = { id: string; label: string; description: string };

export type Topic = {
  id: TopicId;
  label: string;
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
  image: RawImage;
  note: string;
};

export type RawCharacter = {
  id: string;
  name: string;
  line: string;
  plate: string;
  explicit: boolean;
  explicitId?: string;
};

export type RawGalleryItem = {
  id: string;
  title: string;
  plate: string;
  explicit: boolean;
  explicitId?: string;
};

export type MediaView =
  | { state: 'plate'; plate: string; topic: TopicId; alt: string }
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

export type ArticlePage = ArticleCard & {
  tags: string[];
  gear?: Gear;
  updatedLabel?: string;
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

export type CharacterCard = {
  id: string;
  name: string;
  line: string;
  href: string;
  media: MediaView;
};

export type GalleryCard = {
  id: string;
  title: string;
  href: string;
  media: MediaView;
};

export type ReaderMode = {
  ageVerified: boolean;
  /** True only when age is verified and the reader opted in. */
  nsfw: boolean;
  discreet: boolean;
  blur: boolean;
  seed: number;
};
