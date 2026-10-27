import { formatDate } from './format';
import type { Entity, EntityType, Pricing } from './entity-schema';
import type { Catalog, EntityKind, RawImage, TopicId } from './types';

export const ENTITY_TOPIC: Record<EntityType, TopicId> = {
  star: 'stars',
  site: 'sites',
  ai_app: 'ai',
  product: 'toys',
  game: 'vr',
};

export const ENTITY_KIND: Record<EntityType, EntityKind> = {
  star: 'star',
  site: 'site',
  ai_app: 'ai',
  product: 'product',
  game: 'game',
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  star: 'Star',
  site: 'Site',
  ai_app: 'AI app',
  product: 'Toy',
  game: 'Game',
};

export const ENTITY_ROUTE: Record<EntityType, string> = {
  star: '/stars',
  site: '/sites',
  ai_app: '/ai',
  product: '/products',
  game: '/games',
};

export function entityHref(type: EntityType, slug: string): string {
  return `${ENTITY_ROUTE[type]}/${slug}`;
}

export function entityTopic(type: EntityType): TopicId {
  return ENTITY_TOPIC[type];
}

export function entityKind(type: EntityType): EntityKind {
  return ENTITY_KIND[type];
}

export function routeType(kind: EntityKind): EntityType {
  return kind === 'ai' ? 'ai_app' : kind;
}

export function entityToRawImage(entity: Entity): RawImage {
  return {
    alt: entity.image.alt,
    url: entity.image.src,
    sourceUrl: entity.image.source_url,
    license: entity.image.license,
    explicit: false,
    plate: entity.type,
  };
}

export function pricingSummary(pricing: Pricing): string {
  if (pricing.from_price) return `${pricing.from_price} · ${pricing.model}`;
  if (pricing.free_tier) return `Free tier · ${pricing.model}`;
  return pricing.model;
}

export function pricingRows(pricing: Pricing): { label: string; value: string }[] {
  if (pricing.plans.length > 0) {
    return pricing.plans.map((plan) => ({
      label: plan.name,
      value: [plan.price, plan.billing, plan.notes].filter(Boolean).join(' · '),
    }));
  }
  return [
    { label: 'Model', value: pricing.model },
    { label: 'Free tier', value: pricing.free_tier ?? 'No' },
    { label: 'Paid from', value: pricing.from_price ?? '—' },
  ];
}

export function lastCheckedLabel(value: string): string {
  return formatDate(new Date(`${value}T00:00:00Z`));
}

export function entitySources(entity: Entity): { label: string; url: string; checked?: string }[] {
  return entity.facts.map((fact) => ({
    label: `${fact.key}: ${fact.value}`,
    url: fact.source_url,
    checked: fact.checked,
  }));
}

export function findEntity(catalog: Catalog, type: EntityType, slug: string): Entity | null {
  return catalog.entities.find((entity) => entity.type === type && entity.slug === slug) ?? null;
}

export function findEntityBySlug(catalog: Catalog, slug: string): Entity | null {
  return catalog.entities.find((entity) => entity.slug === slug) ?? null;
}

export function entitiesBySlugs(catalog: Catalog, slugs: string[]): Entity[] {
  return slugs.flatMap((slug) => {
    const entity = findEntityBySlug(catalog, slug);
    return entity ? [entity] : [];
  });
}

export function entitiesByType(catalog: Catalog, type: EntityType): Entity[] {
  return catalog.entities.filter((entity) => entity.type === type);
}
