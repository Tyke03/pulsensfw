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
  const tags = new Set<string>();
  const topics = new Set<string>();
  for (const hitItem of hits) {
    if (hitItem.type === 'article') {
      const slug = hitItem.href.split('/').pop() ?? '';
      const story = articles.find((article) => article.slug === slug);
      if (!story) continue;
      for (const entitySlug of story.entitySlugs) {
        const seed = findEntityBySlug(catalog, entitySlug);
        if (!seed) continue;
        exclude.add(seed.slug);
        for (const tag of seed.tags) tags.add(tag);
        topics.add(entityTopic(seed.type));
      }
      continue;
    }
    const slug = hitItem.href.split('/').pop() ?? '';
    const seed = findEntityBySlug(catalog, slug);
    if (!seed) continue;
    exclude.add(seed.slug);
    for (const tag of seed.tags) tags.add(tag);
    topics.add(entityTopic(seed.type));
  }
  if (exclude.size === 0) return [];
  const scored = catalog.entities
    .filter((candidate) => !exclude.has(candidate.slug))
    .map((candidate) => ({
      entity: candidate,
      score:
        (topics.has(entityTopic(candidate.type)) ? 200 : 0) +
        sharedTags(candidate, tags) * 20,
    }))
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
      label: `Compare ${list.length} ${KIND_PLURAL[kind]}`,
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
