import assert from 'node:assert/strict';
import test from 'node:test';
import { safePath } from './safe-path';

test('safePath keeps relative paths and drops off-site targets', () => {
  assert.equal(safePath('/vr?topic=headsets'), '/vr?topic=headsets');
  assert.equal(safePath('https://evil.example'), '/');
  assert.equal(safePath('//evil.example'), '/');
  assert.equal(safePath('/\\evil'), '/');
  assert.equal(safePath('vr'), '/');
  assert.equal(safePath('/ok', '/fallback'), '/ok');
});
