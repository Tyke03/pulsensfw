/**
 * Related reads: pure catalog math, no external calls, no new data.
 * Ranking is a total order (relation score -> recently checked -> slug) so
 * server-rendered HTML is byte-stable across restarts and deploys.
 */
import { presentImage } from './resolve-media';
import {
  ENTITY_LABEL,
  entityHref,
  entityKind,
  entityTopic,
  entityToRawImage,
  findEntityBySlug,
} from './entities';
import type { Entity } from './entity-schema';
import type { Catalog, EntityKind, RawArticle, ReaderMode, SearchHit } from './types';

export const RELATED_MIN = 3;
export const RELATED_MAX = 6;

const KIND_PLURAL: Record<EntityKind, string> = {
  star: 'stars',
  site: 'sites',
  ai: 'AI apps',
  product: 'toys',
  game: 'games',
};

type ScoredEntity = { entity: Entity; score: number };

function rank(scored: ScoredEntity[]): Entity[] {
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.entity.updated.localeCompare(a.entity.updated) ||
      a.entity.slug.localeCompare(b.entity.slug),
  );
  return scored.map(({ entity }) => entity);
}

function sharedTags(candidate: Entity, tags: Set<string>): number {
  return candidate.tags.reduce((count, tag) => (tags.has(tag) ? count + 1 : count), 0);
}

/** Related for one entity: same topic first, then tag overlap, then the same narrow kind. */
export function relatedEntities(entity: Entity, catalog: Catalog): Entity[] {
  if (catalog.entities.length <= 1) return [];
  const tags = new Set(entity.tags);
  const topic = entityTopic(entity.type);
  const kind = entityKind(entity.type);
  const scored = catalog.entities
    .filter((candidate) => candidate.slug !== entity.slug)
    .map((candidate) => ({
      entity: candidate,
      score:
        (entityTopic(candidate.type) === topic ? 200 : 0) +
        sharedTags(candidate, tags) * 20 +
        (entityKind(candidate.type) === kind ? 10 : 0),
    }))
    .filter((item) => item.score > 0);
  return rank(scored).slice(0, RELATED_MAX);
}

/**
 * Related after a search with hits. Seeds are the hit entities themselves;
 * an article hit seeds the entities the story is about. Same-topic names and
 * tag neighbours of the seeds fill the row; the hits themselves never repeat.
 */
export function relatedForSearch(
  hits: Array<Pick<SearchHit, 'type' | 'href'>>,
  catalog: Catalog,
  articles: Array<Pick<RawArticle, 'slug' | 'entitySlugs'>>,
): Entity[] {
  if (catalog.entities.length <= 1) return [];
  const exclude = new Set<string>();
  const tagCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  const addSeed = (seed: Entity) => {
    if (exclude.has(seed.slug)) return;
    exclude.add(seed.slug);
    for (const tag of seed.tags) {
      const key = tag.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
    const tp = entityTopic(seed.type);
    topicCounts.set(tp, (topicCounts.get(tp) ?? 0) + 1);
  };
  for (const hitItem of hits) {
    if (hitItem.type === 'article') {
      const slug = hitItem.href.split('/').pop() ?? '';
      const story = articles.find((article) => article.slug === slug);
      if (!story) continue;
      for (const entitySlug of story.entitySlugs) {
        const seed = findEntityBySlug(catalog, entitySlug);
        if (seed) addSeed(seed);
      }
      continue;
    }
    const slug = hitItem.href.split('/').pop() ?? '';
    const seed = findEntityBySlug(catalog, slug);
    if (seed) addSeed(seed);
  }
  if (exclude.size === 0) return [];
  const scored = catalog.entities
    .filter((candidate) => !exclude.has(candidate.slug))
    .map((candidate) => {
      let tagScore = 0;
      let shared = 0;
      for (const tag of candidate.tags) {
        const freq = tagCounts.get(tag.toLowerCase()) ?? 0;
        if (freq > 0) {
          shared += 1;
          tagScore += 42 + Math.min(freq, 20) * 8;
        }
      }
      const sameTopic = topicCounts.has(entityTopic(candidate.type));
      return {
        entity: candidate,
        score: tagScore + (sameTopic && (shared > 0 || tagCounts.size === 0) ? 120 : 0),
      };
    })
    .filter((item) => item.score > 0);
  return rank(scored).slice(0, RELATED_MAX);
}

/** Same-kind slice of the related set — the "Compare" entry on an entity page. */
export function sameKindRelated(entity: Entity, catalog: Catalog, max = 3): Entity[] {
  const kind = entityKind(entity.type);
  return relatedEntities(entity, catalog)
    .filter((candidate) => entityKind(candidate.type) === kind)
    .slice(0, max);
}

export type CompareGroup = { kind: EntityKind; label: string; ids: string[] };

/** Compare chips for a results page: only kinds that have 2+ hits, in hit order. */
export function compareGroups(hits: SearchHit[], catalog: Catalog): CompareGroup[] {
  const perKind = new Map<EntityKind, Entity[]>();
  for (const hit of hits) {
    if (hit.type === 'article' || hit.type === 'all') continue;
    const slug = hit.href.split('/').pop() ?? '';
    const entity = slug
      ? catalog.entities.find((item) => item.slug === slug && entityKind(item.type) === hit.type)
      : null;
    if (!entity) continue;
    const group = perKind.get(hit.type) ?? [];
    if (group.every((item) => item.slug !== entity.slug)) group.push(entity);
    perKind.set(hit.type, group);
  }
  return [...perKind.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([kind, list]) => ({
      kind,
      label: list.length > 4 ? `Compare top 4 ${KIND_PLURAL[kind]}` : `Compare ${list.length} ${KIND_PLURAL[kind]}`,
      ids: list.slice(0, 4).map((entity) => entity.slug),
    }));
}

/** A related entity as a search-hit-shaped card, so it renders through HitCard. */
export function entityHit(entity: Entity, reader: ReaderMode): SearchHit {
  const topic = entityTopic(entity.type);
  return {
    type: entityKind(entity.type),
    title: entity.name,
    dek: entity.summary,
    href: entityHref(entity.type, entity.slug),
    topic,
    kicker: ENTITY_LABEL[entity.type],
    media: presentImage(entityToRawImage(entity), topic, `entity:${entity.type}:${entity.slug}`, reader),
  };
}

/** Seed pick for a browseable default set (max 3, most recently checked, stable). */
export function recentOfKind(catalog: Catalog, kind: EntityKind, max = 3): Entity[] {
  const types = kind === 'ai' ? ['ai_app', 'frontend'] : [kind];
  return catalog.entities
    .filter((entity) => types.includes(entity.type))
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug))
    .slice(0, max);
}
