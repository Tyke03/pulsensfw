import { getCollection, type CollectionEntry } from 'astro:content';
import dealsJson from '../../content/deals.json';
import charactersJson from '../../content/characters.json';
import galleryJson from '../../content/gallery.json';
import topicsJson from '../../content/topics.json';
import { isExplicitId } from '../media/explicit-catalog';
import type { ContentRepository } from './repository';
import { byDateDesc } from './present';
import type { Badge, Kind, RailId, RawArticle, RawCharacter, RawDeal, RawGalleryItem, RawImage, Topic, TopicId } from './types';

type ArticleEntry = CollectionEntry<'articles'>;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function imageOf(slug: string, image: ArticleEntry['data']['image']): RawImage {
  if (image.explicit && !isExplicitId(image.explicitId)) {
    throw new Error(`Article ${slug} is explicit but has no catalog id.`);
  }
  return {
    alt: image.alt,
    plate: image.plate,
    explicit: image.explicit,
    explicitId: image.explicitId,
  };
}

export function articleFromEntry(entry: ArticleEntry): RawArticle {
  const data = entry.data;
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
    image: imageOf(entry.id, data.image),
    gear: data.gear,
    bodyText: entry.body ?? '',
    example: true,
  };
}

function assertDealImages() {
  for (const deal of dealsJson) {
    if (deal.image.explicit && !isExplicitId(deal.image.explicitId)) {
      throw new Error(`Deal ${deal.id} is missing an explicit catalog id.`);
    }
  }
  for (const character of charactersJson) {
    if (character.explicit && !isExplicitId(character.explicitId)) {
      throw new Error(`Character ${character.id} is missing an explicit catalog id.`);
    }
  }
  for (const item of galleryJson) {
    if (item.explicit && !isExplicitId(item.explicitId)) {
      throw new Error(`Gallery ${item.id} is missing an explicit catalog id.`);
    }
  }
}

assertDealImages();

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
    return dealsJson as RawDeal[];
  },
  async listCharacters() {
    return charactersJson as RawCharacter[];
  },
  async listGallery() {
    return galleryJson as RawGalleryItem[];
  },
  async search(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const articles = await this.listArticles();
    return articles
      .filter((article) => {
        const haystack = [article.title, article.dek, article.kicker, article.topic, article.kind, article.bodyText]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 24);
  },
};

export function getContentRepository(): ContentRepository {
  return localContentRepository;
}
