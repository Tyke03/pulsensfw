/** Server-side session shape shared by the Neon Auth integration. */
export type SessionRow = {
  userId: string;
  email: string | null;
};

/** Cookie header extraction helper used by routes without a Headers object. */
export function cookieHeaderFrom(cookies: { [key: string]: { value: string } | undefined }, names: string[]): string {
  const parts = names
    .map((name) => (cookies[name] ? `${name}=${cookies[name]!.value}` : null))
    .filter((part): part is string => Boolean(part));
  return parts.join('; ');
}
