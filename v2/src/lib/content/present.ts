import { presentImage } from './resolve-media';
import { articleHref, formatDate } from './format';
import type {
  ArticleCard,
  ArticlePage,
  CharacterCard,
  DealCard,
  GalleryCard,
  RawArticle,
  RawCharacter,
  RawDeal,
  RawGalleryItem,
  ReaderMode,
} from './types';

export function presentArticle(article: RawArticle, reader: ReaderMode): ArticlePage {
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
    media: presentImage(article.image, article.topic, `story:${article.slug}`, reader),
    example: true,
  };
  return {
    ...card,
    tags: article.tags,
    gear: article.gear,
    updatedLabel: article.updatedAt ? formatDate(article.updatedAt) : undefined,
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
    media: presentImage(deal.image, deal.topic, `deal:${deal.id}`, reader),
  };
}

export function presentCharacter(character: RawCharacter, reader: ReaderMode): CharacterCard {
  return {
    id: character.id,
    name: character.name,
    line: character.line,
    href: 'https://companionhub.app',
    media: presentImage(
      {
        alt: `${character.name}, example character portrait`,
        plate: character.plate,
        explicit: character.explicit,
        explicitId: character.explicitId,
      },
      'ai-chat',
      `cast:${character.id}`,
      reader,
    ),
  };
}

export function presentGallery(item: RawGalleryItem, reader: ReaderMode): GalleryCard {
  return {
    id: item.id,
    title: item.title,
    href: 'https://www.deviantart.com/',
    media: presentImage(
      {
        alt: `${item.title}, placeholder gallery plate`,
        plate: item.plate,
        explicit: item.explicit,
        explicitId: item.explicitId,
      },
      'creators',
      `gallery:${item.id}`,
      reader,
    ),
  };
}

export function byDateDesc(a: RawArticle, b: RawArticle): number {
  return b.publishedAt.getTime() - a.publishedAt.getTime();
}
