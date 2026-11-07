import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getServerSession, neonAuthConfigured, neonAuthConfiguredWith } from './neon';

const BASE = 'https://ep-test.neonauth.example.neon.tech/neondb/auth';

describe('Neon Auth (Managed Better Auth) configuration gate', () => {
  it('is unconfigured without env — the desk stays in honest guest state', () => {
    assert.equal(neonAuthConfigured(), false);
  });

  it('accepts a https base URL plus a 32+ char cookie secret', () => {
    assert.equal(
      neonAuthConfiguredWith({ NEON_AUTH_BASE_URL: BASE, NEON_AUTH_COOKIE_SECRET: 'a'.repeat(32) }),
      true,
    );
  });

  it('rejects short secrets and non-https base urls (fail closed)', () => {
    assert.equal(
      neonAuthConfiguredWith({ NEON_AUTH_BASE_URL: BASE, NEON_AUTH_COOKIE_SECRET: 'short' }),
      false,
    );
    assert.equal(
      neonAuthConfiguredWith({ NEON_AUTH_BASE_URL: 'http://not-secure.test/auth', NEON_AUTH_COOKIE_SECRET: 'a'.repeat(32) }),
      false,
    );
    assert.equal(
      neonAuthConfiguredWith({}),
      false,
    );
  });
});

describe('getServerSession (server-side verification; mocked upstream)', () => {
  it('MOCK: returns null when the managed service is unreachable', async () => {
    const session = await getServerSession(new Headers({ cookie: 'better-auth.session_token=x' }), {
      env: { NEON_AUTH_BASE_URL: BASE, NEON_AUTH_COOKIE_SECRET: 'a'.repeat(32) },
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    assert.equal(session, null);
  });

  it('MOCK: returns null without an active session (guest)', async () => {
    const session = await getServerSession(new Headers({ cookie: 'something=else' }), {
      env: { NEON_AUTH_BASE_URL: BASE, NEON_AUTH_COOKIE_SECRET: 'a'.repeat(32) },
      fetchImpl: (async () => new Response(JSON.stringify({ user: null }), { status: 200 })) as typeof fetch,
    });
    assert.equal(session, null);
  });

  it('MOCK: identity comes only from the server-verified upstream response', async () => {
    let calledPath = '';
    const session = await getServerSession(new Headers({ cookie: 'better-auth.session_token=x; innocent=1' }), {
      env: { NEON_AUTH_BASE_URL: BASE, NEON_AUTH_COOKIE_SECRET: 'a'.repeat(32) },
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        calledPath = String(input);
        return new Response(JSON.stringify({ user: { id: 'usr_123', email: 'reader@example.com' }, session: { id: 's1' } }), { status: 200 });
      }) as typeof fetch,
    });
    assert.notEqual(session, null);
    if (session) {
      assert.equal(session.userId, 'usr_123');
      assert.equal(session.email, 'reader@example.com');
    }
    assert.ok(calledPath.endsWith(`${BASE}/get-session`));
  });
});
