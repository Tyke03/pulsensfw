import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createVendorAgeProvider } from './vendor-provider';

function withFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => handler(String(input), init);
  return () => {
    globalThis.fetch = original;
  };
}

describe('vendor age provider', () => {
  it('rejects proof without a token', async () => {
    const provider = createVendorAgeProvider({ apiUrl: 'https://vendor.example/v1/verify', apiKey: 'k' });
    const result = await provider.verify({ providerId: 'vendor.v1', vendorPayload: {} });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'missing-token');
  });

  it('sends the bearer key and honours the vendor verdict', async () => {
    let capturedAuth = '';
    let capturedBody = '';
    const restore = withFetch(async (_input, init) => {
      capturedAuth = String((init?.headers as Record<string, string>)?.authorization ?? '');
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    try {
      const provider = createVendorAgeProvider({ apiUrl: 'https://vendor.example/v1/verify', apiKey: 'k' });
      const result = await provider.verify({ providerId: 'vendor.v1', vendorPayload: { token: 'tok-1' } });
      assert.equal(result.ok, true);
      assert.equal(result.providerId, 'vendor.v1');
      assert.match(capturedAuth, /^Bearer k$/);
      assert.match(capturedBody, /tok-1/);
    } finally {
      restore();
    }
  });

  it('treats verified-style responses as OK', async () => {
    const restore = withFetch(async () => new Response(JSON.stringify({ verified: true }), { status: 200 }));
    try {
      const provider = createVendorAgeProvider({ apiUrl: 'https://v', apiKey: 'k' });
      const result = await provider.verify({ providerId: 'vendor.v1', vendorPayload: { token: 't' } });
      assert.equal(result.ok, true);
    } finally {
      restore();
    }
  });

  it('stays honest on vendor rejection and HTTP failure', async () => {
    const restore1 = withFetch(async () => new Response(JSON.stringify({ ok: false, reason: 'paperwork' }), { status: 200 }));
    try {
      const provider = createVendorAgeProvider({ apiUrl: 'https://v', apiKey: 'k' });
      const failed = await provider.verify({ providerId: 'vendor.v1', vendorPayload: { token: 't' } });
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.equal(failed.reason, 'paperwork');
    } finally {
      restore1();
    }
    const restore2 = withFetch(async () => new Response('error', { status: 503 }));
    try {
      const provider = createVendorAgeProvider({ apiUrl: 'https://v', apiKey: 'k' });
      const result = await provider.verify({ providerId: 'vendor.v1', vendorPayload: { token: 't' } });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'vendor-unavailable');
    } finally {
      restore2();
    }
  });

  it('never asks our forms for identity documents', () => {
    const provider = createVendorAgeProvider({ apiUrl: 'https://v', apiKey: 'k' });
    const challenge = provider.createChallenge();
    assert.ok(challenge.fields.length > 0);
    for (const field of challenge.fields) {
      assert.equal(field.type, 'acknowledgement');
      assert.ok(!/passport|government.id|card number|upload|selfie/i.test(field.name));
    }
    // The flow may only carry a short-lived vendor token from our gate.
    assert.ok(!JSON.stringify(challenge).includes('file'));
  });
});
