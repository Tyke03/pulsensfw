import { presentEntity } from './present';
import type { Entity } from './entity-schema';
import type { ArticlePage, Catalog, EntityCard, ReaderMode } from './types';

export type TemplateEntity = EntityCard & {
  entity: Entity;
  lastChecked: string;
};

/** Resolve the article's slug refs into full entity rows for a template. */
export function buildTemplateEntities(
  article: Pick<ArticlePage, 'entitySlugs'>,
  catalog: Catalog,
  reader: ReaderMode,
): TemplateEntity[] {
  return article.entitySlugs.flatMap((slug) => {
    const entity = catalog.entities.find((item) => item.slug === slug);
    if (!entity) return [];
    return [{ ...presentEntity(entity, reader), entity, lastChecked: entity.updated }];
  });
}
