import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ageCookieOk } from './cookies';

describe('ageCookieOk', () => {
  it('accepts the stub marker', () => {
    assert.equal(ageCookieOk('stub.v1'), true);
  });

  it('accepts vendor markers but nothing else', () => {
    assert.equal(ageCookieOk('vendor.v1'), true);
    assert.equal(ageCookieOk('vendor.v2'), true);
    assert.equal(ageCookieOk('vendor.v1.sealed'), true);
    assert.equal(ageCookieOk('1'), false);
    assert.equal(ageCookieOk('yes'), false);
    assert.equal(ageCookieOk(''), false);
    assert.equal(ageCookieOk(undefined), false);
    assert.equal(ageCookieOk('vendor-junk'), false);
    assert.equal(ageCookieOk('vendor.fake.v99'), false);
  });
});
