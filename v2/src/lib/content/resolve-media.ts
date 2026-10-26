import { categoryCover } from '../brand/slots';
import { coverMarkup, hashString } from '../media/cover-plate';
import type { MediaView, RawImage, ReaderMode, TopicId } from './types';

export const PLACEHOLDERS = [
  '/media/placeholders/pulse-a.svg',
  '/media/placeholders/pulse-b.svg',
  '/media/placeholders/pulse-c.svg',
  '/media/placeholders/pulse-d.svg',
] as const;

/**
 * Stable across a browser session (seed cookie) and varied across images.
 * Math.random() would change the URL between renders and shift layout.
 */
export function pickPlaceholder(key: string, seed: number): string {
  const index = hashString(`${seed}:${key}`) % PLACEHOLDERS.length;
  return PLACEHOLDERS[index] ?? PLACEHOLDERS[0];
}

/**
 * SFW responses must not include explicit image URLs or the server key that maps to them.
 */
export function presentImage(image: RawImage, topic: TopicId, key: string, reader: Pick<ReaderMode, 'nsfw' | 'seed'>): MediaView {
  if (image.explicit) {
    if (reader.nsfw && image.explicitId) {
      return {
        state: 'explicit',
        src: `/media/explicit/${encodeURIComponent(image.explicitId)}`,
        alt: image.alt,
      };
    }
    return {
      state: 'withheld',
      src: pickPlaceholder(key, reader.seed),
      alt: 'Image withheld in SFW mode',
    };
  }
  if (image.url) {
    return { state: 'file', src: image.url, alt: image.alt };
  }
  if (image.plate) {
    return { state: 'plate', plate: image.plate, topic, alt: image.alt };
  }
  return { state: 'file', src: categoryCover(topic), alt: image.alt };
}

export function explicitSvg(id: string, topic: TopicId, plate: string): string {
  return coverMarkup({ plate, topic, alt: '', uid: `explicit-${id}`, decorative: true });
}
