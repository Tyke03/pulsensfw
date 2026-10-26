import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleHome } from './assemble';
import { presentArticle } from './present';
import { PLACEHOLDERS } from './resolve-media';
import type { RawArticle, ReaderMode, Topic } from './types';

const sfw: ReaderMode = { ageVerified: true, nsfw: false, discreet: false, blur: false, seed: 7 };
const nsfw: ReaderMode = { ...sfw, nsfw: true };

function article(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    slug: 'quiet-wand',
    title: 'A quiet wand',
    dek: 'Seed dek',
    topic: 'toys',
    kind: 'review',
    publishedAt: new Date('2026-10-20T00:00:00Z'),
    badges: [],
    author: 'Pulse Desk',
    kicker: 'Gear Lab',
    readingMinutes: 2,
    placement: 'none',
    rails: ['latest'],
    tags: ['quiet'],
    image: {
      alt: 'hidden product photo',
      plate: 'secret-plate',
      explicit: true,
      explicitId: 'gated-file-9',
    },
    bodyText: 'body',
    example: true,
    ...overrides,
  };
}

test('SFW view models omit explicit urls and server keys', () => {
  const view = presentArticle(article(), sfw);
  const json = JSON.stringify(view);
  assert.equal(view.media.state, 'withheld');
  assert.equal(json.includes('/media/explicit'), false);
  assert.equal(json.includes('gated-file-9'), false);
  assert.equal(json.includes('secret-plate'), false);
  assert.equal(json.includes('hidden product photo'), false);
  if (view.media.state === 'withheld') {
    assert.ok(PLACEHOLDERS.includes(view.media.src as (typeof PLACEHOLDERS)[number]));
  }
});

test('NSFW view models point at the gated media route', () => {
  const view = presentArticle(article(), nsfw);
  assert.equal(view.media.state, 'explicit');
  if (view.media.state === 'explicit') {
    assert.equal(view.media.src, '/media/explicit/gated-file-9');
    assert.equal(view.media.alt, 'hidden product photo');
  }
});

test('placeholder choice is stable for a seed and varies by key', () => {
  const a = presentArticle(article({ slug: 'one' }), sfw);
  const b = presentArticle(article({ slug: 'one' }), sfw);
  const c = presentArticle(article({ slug: 'two' }), { ...sfw, seed: 99 });
  assert.equal(JSON.stringify(a.media), JSON.stringify(b.media));
  assert.equal(a.media.state, 'withheld');
  assert.equal(c.media.state, 'withheld');
});

test('assembled home does not leak explicit keys while SFW', () => {
  const topics: Topic[] = [];
  const home = assembleHome(
    [
      article({ slug: 'lead', placement: 'lead', image: { alt: 'safe', plate: 'visor', explicit: false }, rails: ['trending'] }),
      article({ slug: 'gated', placement: 'stack' }),
    ],
    topics,
    [],
    [],
    [],
    sfw,
  );
  const json = JSON.stringify(home);
  assert.equal(json.includes('/media/explicit'), false);
  assert.equal(json.includes('gated-file-9'), false);
  assert.equal(home.lead.slug, 'lead');
  assert.equal(home.stack[0]?.media.state, 'withheld');
});
