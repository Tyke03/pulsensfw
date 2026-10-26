import type { TopicId } from '../content/types';

/**
 * Server-only registry of images that are explicit.
 * Keys are not URLs. The HTML layer must not receive these keys in SFW mode.
 * Art is drawn by the cover generator and served from /media/explicit/[id]
 * only after the age check and the NSFW opt-in.
 */
export const explicitCatalog: Record<string, { topic: TopicId; plate: string }> = {
  lumen: { topic: 'toys', plate: 'lumen-wand' },
  pebble: { topic: 'toys', plate: 'sync-pebble' },
  'nova-still': { topic: 'stars', plate: 'nova-still' },
  'velvet-still': { topic: 'sites', plate: 'velvet-still' },
  'visor-scene': { topic: 'vr', plate: 'visor-scene' },
};

export function isExplicitId(id: string | undefined): id is string {
  return Boolean(id && Object.prototype.hasOwnProperty.call(explicitCatalog, id));
}
