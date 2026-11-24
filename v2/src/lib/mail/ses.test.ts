import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mailConfig, sigv4Authorization } from './ses';

/**
 * Provenance: official AWS SigV4 test suite, `get-vanilla` case
 * (aws-sig-v4-test-suite). Request: GET / Host: example.amazonaws.com,
 * X-Amz-Date 20150830T123600Z, empty body, AKIDEXAMPLE +
 * secret wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY (the suite's secret_key).
 * Expected authorization header copied from get-vanilla.authz.
 */
describe('sigv4Authorization', () => {
  it('matches the official AWS SigV4 test suite "get-vanilla"', async () => {
    const result = await sigv4Authorization({
      method: 'GET',
      host: 'example.amazonaws.com',
      path: '/',
      query: {},
      headers: { host: 'example.amazonaws.com' },
      body: '',
      region: 'us-east-1',
      service: 'service',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      stamp: new Date('2015-08-30T12:36:00Z'),
    });
    assert.equal(result.amzDate, '20150830T123600Z');
    assert.equal(
      result.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, '
      + 'SignedHeaders=host;x-amz-date, '
      + 'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('changes the signature when method, path, or body changes (tamper check)', async () => {
    const base = {
      method: 'POST',
      host: 'email.us-east-1.amazonaws.com',
      path: '/v2/email/outbound-emails',
      query: {},
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
      region: 'us-east-1',
      service: 'ses',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      stamp: new Date('2026-01-01T00:00:00Z'),
    };
    const one = await sigv4Authorization(base);
    const two = await sigv4Authorization({ ...base, body: '{"a":2}' });
    const three = await sigv4Authorization({ ...base, path: '/v2/other' });
    assert.notEqual(one.authorization, two.authorization);
    assert.notEqual(one.authorization, three.authorization);
  });

  it('uses AWS4-HMAC-SHA256 and includes the host in every scope', async () => {
    const result = await sigv4Authorization({
      method: 'GET',
      host: 'Example.Endpoint',
      path: '/a b/c',
      query: { Zed: 'last', alpha: 'first' },
      headers: { HOST: 'Example.Endpoint' },
      body: '',
      region: 'us-east-1',
      service: 'ses',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      stamp: new Date('2015-08-30T12:36:00Z'),
    });
    assert.match(result.authorization, /SignedHeaders=host;x-amz-date/);
    assert.match(result.authorization, /Credential=AKIDEXAMPLE\/20150830\/us-east-1\/ses\/aws4_request/);
  });

  it('is canonical: query and header order do not change the signature', async () => {
    const base = {
      method: 'GET',
      host: 'example.amazonaws.com',
      path: '/x',
      region: 'us-east-1',
      service: 'ses',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      stamp: new Date('2015-08-30T12:36:00Z'),
      body: '',
    };
    const one = await sigv4Authorization({ ...base, query: { Zed: 'last', alpha: 'first' }, headers: { HOST: 'example.amazonaws.com' } });
    const two = await sigv4Authorization({ ...base, query: { alpha: 'first', Zed: 'last' }, headers: { host: 'example.amazonaws.com' } });
    assert.equal(one.authorization, two.authorization);
  });

  it('does not leak the secret key into the authorization header', async () => {
    const result = await sigv4Authorization({
      method: 'POST',
      host: 'x',
      path: '/',
      query: {},
      headers: {},
      body: 'p',
      region: 'us-east-1',
      service: 'ses',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'SUPERSECRETVALUE',
      stamp: new Date(),
    });
    assert.ok(!result.authorization.includes('SUPERSECRETVALUE'));
  });
});

describe('mailConfig', () => {
  it('reports null when any required var is missing', () => {
    assert.equal(mailConfig({}), null);
    assert.equal(mailConfig({ MAIL_FROM: 'x', MAIL_ACCESS_KEY_ID: 'k' }), null);
    assert.equal(
      mailConfig({ MAIL_FROM: 'news@x', MAIL_ACCESS_KEY_ID: 'k', MAIL_SECRET_ACCESS_KEY: 's' })?.region,
      'us-east-1',
    );
  });
});
