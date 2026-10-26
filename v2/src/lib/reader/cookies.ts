import type { ReaderMode } from '../content/types';

export const COOKIE = {
  age: 'pulse_age',
  nsfw: 'pulse_nsfw',
  discreet: 'pulse_discreet',
  blur: 'pulse_blur',
  seed: 'pulse_seed',
} as const;

/** Marker set only by the stub verifier. Not an identity document. */
export const AGE_STUB_VALUE = 'stub.v1';

export type CookieStore = {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options?: Record<string, unknown>): void;
};

export function cookieBase(secure: boolean, maxAge = 60 * 60 * 24 * 400) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    secure,
    httpOnly: true,
    maxAge,
  };
}

export function readReader(cookies: CookieStore, secure = false): ReaderMode {
  let seedRaw = cookies.get(COOKIE.seed)?.value ?? '';
  if (!/^\d{1,12}$/.test(seedRaw)) {
    seedRaw = String(Math.floor(Math.random() * 1_000_000_000));
    cookies.set?.(COOKIE.seed, seedRaw, cookieBase(secure));
  }
  const ageVerified = cookies.get(COOKIE.age)?.value === AGE_STUB_VALUE;
  const nsfw = ageVerified && cookies.get(COOKIE.nsfw)?.value === '1';
  return {
    ageVerified,
    nsfw,
    discreet: cookies.get(COOKIE.discreet)?.value === '1',
    blur: cookies.get(COOKIE.blur)?.value === '1',
    seed: Number(seedRaw),
  };
}
