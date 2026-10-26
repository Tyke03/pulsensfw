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
  lighting: { topic: 'creators', plate: 'small-set-light' },
  quiet: { topic: 'toys', plate: 'quiet-ten' },
  vrscenes: { topic: 'vr', plate: 'scene-ten' },
  haptic: { topic: 'vr', plate: 'haptic-map' },
  strap: { topic: 'vr', plate: 'northstar-strap' },
  mistakes: { topic: 'creators', plate: 'set-mistakes' },
  'cast-01': { topic: 'ai-chat', plate: 'cast-night' },
  'cast-02': { topic: 'ai-chat', plate: 'cast-glass' },
  'cast-03': { topic: 'ai-chat', plate: 'cast-low' },
  'gal-01': { topic: 'creators', plate: 'gallery-neon-room' },
  'gal-02': { topic: 'creators', plate: 'gallery-red-drape' },
  'gal-03': { topic: 'toys', plate: 'gallery-still-life' },
  'gal-04': { topic: 'vr', plate: 'gallery-visor' },
};

export function isExplicitId(id: string | undefined): id is string {
  return Boolean(id && Object.prototype.hasOwnProperty.call(explicitCatalog, id));
}
