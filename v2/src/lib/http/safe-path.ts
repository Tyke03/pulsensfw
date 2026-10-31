/** Same-origin relative paths only. Blocks open redirects. */
export function safePath(input: string | null | undefined, fallback = '/'): string {
  if (!input) return fallback;
  if (!input.startsWith('/')) return fallback;
  if (input.startsWith('//')) return fallback;
  if (input.includes('\\') || input.includes('://')) return fallback;
  if (/[\u0000-\u001f]/.test(input)) return fallback;
  return input;
}
