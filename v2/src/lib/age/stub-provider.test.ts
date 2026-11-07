import assert from 'node:assert/strict';
import test from 'node:test';
import { createStubAgeProvider } from './stub-provider';

test('stub challenge asks for an acknowledgement and nothing else', () => {
  const provider = createStubAgeProvider();
  const challenge = provider.createChallenge();
  assert.equal(challenge.providerId, 'stub.v1');
  assert.equal(challenge.fields.length, 1);
  assert.equal(challenge.fields[0]?.type, 'acknowledgement');
  assert.match(challenge.disclosure, /does not check an ID/i);
});

test('stub verifier rejects a missing acknowledgement', async () => {
  const provider = createStubAgeProvider();
  const denied = await provider.verify({ providerId: 'stub.v1', vendorPayload: { over18: 'no' } });
  assert.equal(denied.ok, false);
  const allowed = await provider.verify({ providerId: 'stub.v1', vendorPayload: { over18: 'yes' } });
  assert.equal(allowed.ok, true);
});
