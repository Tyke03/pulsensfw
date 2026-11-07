/**
 * Compare: URL to same-kind side-by-side table.
 * Every cell comes from the entity record. Nothing is invented — a missing
 * fact renders as an em dash ("—").
 */
import {
  entityKind,
  findEntityBySlug,
  lastCheckedLabel,
  pricingSummary,
} from './entities';
import type { Entity, Pricing } from './entity-schema';
import type { Catalog, EntityKind } from './types';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse the `ids` CSV: trim, lowercase, slug-safe only, dedupe, cap at four. */
export function parseCompareIds(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    ids.push(slug);
    if (ids.length >= COMPARE_MAX) break;
  }
  return ids;
}

export type CompareState =
  | {
      status: 'ok';
      kind: EntityKind;
      kindLabel: string;
      kindPlural: string;
      entities: Entity[];
    }
  | { status: 'empty' }
  | { status: 'too-few'; ready: Entity[] }
  | { status: 'unknown-id'; missing: string[]; ready: Entity[] }
  | { status: 'mixed'; kindLabels: string[]; ready: Entity[] };

const KIND_LABEL: Record<EntityKind, string> = {
  star: 'Star',
  site: 'Site',
  ai: 'AI app',
  product: 'Toy',
  game: 'Game',
};

const KIND_PLURAL: Record<EntityKind, string> = {
  star: 'stars',
  site: 'sites',
  ai: 'AI apps',
  product: 'toys',
  game: 'games',
};

export function loadCompare(catalog: Catalog, ids: string[]): CompareState {
  if (ids.length === 0) return { status: 'empty' };
  const ready = ids.flatMap((slug) => {
    const entity = findEntityBySlug(catalog, slug);
    return entity ? [entity] : [];
  });
  const missing = ids.filter((slug) => !findEntityBySlug(catalog, slug));
  if (ready.length < COMPARE_MIN) {
    if (missing.length === 0) {
      return { status: 'too-few', ready };
    }
    return { status: 'unknown-id', missing, ready };
  }
  const kinds = [...new Set(ready.map((entity) => entityKind(entity.type)))];
  if (kinds.length > 1) {
    return { status: 'mixed', kindLabels: kinds.map((kind) => KIND_LABEL[kind]), ready };
  }
  const kind = entityKind(ready[0].type);
  return {
    status: 'ok',
    kind,
    kindLabel: KIND_LABEL[kind],
    kindPlural: KIND_PLURAL[kind],
    entities: ready,
  };
}

const NSFW_NOTE_KEYS = [
  'uncensored positioning',
  'adult content',
  '18+ policy',
  'adult verification',
  'media policy',
];

/**
 * "NSFW mode notes" come from checked facts where they exist — uncensored
 * positioning, 18+ policy, adult verification. When the record carries none,
 * the cell is an em dash.
 */
function nsfwNote(entity: Entity): string {
  const notes = entity.facts.filter((fact) => {
    const key = fact.key.toLowerCase();
    return NSFW_NOTE_KEYS.some((pattern) => key.includes(pattern)) || /nsfw/i.test(key);
  }).slice(0, 2);
  const lines = notes.map((fact) => `${fact.key}: ${fact.value}`);
  return lines.length > 0 ? lines.join(' · ') : '—';
}

function pricingCell(pricing: Pricing): string {
  const empty =
    !pricing.from_price && !pricing.free_tier && pricing.plans.length === 0 && pricing.model === 'Unknown';
  return empty ? '—' : pricingSummary(pricing);
}

function bullets(values: string[]): string {
  const top = values.slice(0, 3);
  return top.length > 0 ? top.join(' · ') : '—';
}

export type CompareRow = { label: string; values: string[] };

/** One row per field, values aligned with the entities array order. */
export function compareRows(entities: Entity[]): CompareRow[] {
  const cells = entities.map((entity) => ({
    score: entity.score === null ? '—' : `${entity.score.toFixed(1)} / 10`,
    pricing: pricingCell(entity.pricing),
    platforms: entity.platforms.length > 0 ? entity.platforms.join(' · ') : '—',
    nsfw: nsfwNote(entity),
    checked: lastCheckedLabel(entity.updated),
    pros: bullets(entity.pros),
    cons: bullets(entity.cons),
  }));
  return [
    { label: 'Score', values: cells.map((cell) => cell.score) },
    { label: 'Pricing', values: cells.map((cell) => cell.pricing) },
    { label: 'Platforms', values: cells.map((cell) => cell.platforms) },
    { label: 'NSFW mode', values: cells.map((cell) => cell.nsfw) },
    { label: 'Last checked', values: cells.map((cell) => cell.checked) },
    { label: 'Pros', values: cells.map((cell) => cell.pros) },
    { label: 'Cons', values: cells.map((cell) => cell.cons) },
  ];
}

/** Chips shown alongside the table: more of the same kind, most recently checked. */
export function compareSuggestions(catalog: Catalog, entities: Entity[], max = 4): Entity[] {
  if (entities.length === 0) return [];
  const kind = entityKind(entities[0].type);
  const take = entities.map((entity) => entity.slug);
  return catalog.entities
    .filter(
      (candidate) =>
        entityKind(candidate.type) === kind && !take.includes(candidate.slug),
    )
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug))
    .slice(0, max);
}
