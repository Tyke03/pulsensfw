/** Canonical helpers shared by agent stores and the service (round 2E). */

export const STALE_PUBLICATION = 'stale-publication';

const encoder = new TextEncoder();

export async function fingerprintOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * Stable JSON stringify (sorted keys, arrays preserved) so two identical
 * inputs hash the same regardless of key order on the wire.
 */
export async function requestHashOf(input: unknown): Promise<string> {
  const seen = new WeakSet<object>();
  const stable = JSON.stringify(input, (_key, item) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      if (seen.has(item as object)) return '[circular]';
      seen.add(item as object);
      return Object.keys(item as object).sort().reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (item as Record<string, unknown>)[key];
        return acc;
      }, {});
    }
    return item;
  });
  return fingerprintOf(stable);
}
