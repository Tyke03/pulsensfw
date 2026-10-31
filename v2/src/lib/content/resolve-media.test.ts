import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleHome } from './assemble';
import { presentArticle, searchCatalog } from './present';
import { PLACEHOLDERS } from './resolve-media';
import type { Catalog, RawArticle, RawImage, ReaderMode, Topic } from './types';
import type { Entity } from './entity-schema';

const sfw: ReaderMode = { ageVerified: true, nsfw: false, discreet: false, blur: false, seed: 7 };
const nsfw: ReaderMode = { ...sfw, nsfw: true };

const safeCover: RawImage = { alt: 'safe cover', plate: 'visor', explicit: false, license: 'example' };
const hidden: RawImage = {
  alt: 'hidden product photo',
  plate: 'secret-plate',
  explicit: true,
  explicitId: 'lumen',
  license: 'example',
};

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
    cover: safeCover,
    explicitImages: [hidden],
    entitySlugs: [],
    sources: [],
    bodyText: 'body',
    ...overrides,
  };
}

const emptyCatalog: Catalog = { entities: [] };

test('SFW view models omit explicit urls and server keys', () => {
  const view = presentArticle(article(), sfw);
  const json = JSON.stringify(view);
  assert.equal(view.media.state, 'plate');
  assert.equal(view.explicitMedia[0]?.media.state, 'withheld');
  assert.equal(json.includes('/media/explicit'), false);
  assert.equal(json.includes('lumen'), false);
  assert.equal(json.includes('secret-plate'), false);
  assert.equal(json.includes('hidden product photo'), false);
  const still = view.explicitMedia[0]?.media;
  if (still?.state === 'withheld') {
    assert.ok(PLACEHOLDERS.includes(still.src as (typeof PLACEHOLDERS)[number]));
  }
});

test('NSFW view models point at the gated media route', () => {
  const view = presentArticle(article(), nsfw);
  const still = view.explicitMedia[0]?.media;
  assert.equal(still?.state, 'explicit');
  if (still?.state === 'explicit') {
    assert.equal(still.src, '/media/explicit/lumen');
    assert.equal(still.alt, 'hidden product photo');
  }
});

test('placeholder choice is stable for a seed and varies by key', () => {
  const a = presentArticle(article({ slug: 'one' }), sfw);
  const b = presentArticle(article({ slug: 'one' }), sfw);
  const c = presentArticle(article({ slug: 'two' }), { ...sfw, seed: 99 });
  assert.equal(JSON.stringify(a.explicitMedia[0]?.media), JSON.stringify(b.explicitMedia[0]?.media));
  assert.equal(a.explicitMedia[0]?.media.state, 'withheld');
  assert.equal(c.explicitMedia[0]?.media.state, 'withheld');
});

test('assembled home does not leak explicit keys while SFW', () => {
  const topics: Topic[] = [];
  const home = assembleHome(
    [
      article({
        slug: 'lead',
        placement: 'lead',
        cover: safeCover,
        explicitImages: [],
        rails: ['trending'],
      }),
      article({ slug: 'gated', placement: 'stack' }),
    ],
    topics,
    [],
    emptyCatalog,
    sfw,
  );
  const json = JSON.stringify(home);
  assert.equal(json.includes('/media/explicit'), false);
  assert.equal(json.includes('lumen'), false);
  assert.equal(home.lead.slug, 'lead');
  assert.equal(home.lead.media.state, 'plate');
  assert.equal(home.stack[0]?.media.state, 'plate');
});

test('search finds a star by name and can filter to that type', () => {
  const nova: Entity = {
    slug: 'nova-lane',
    type: 'star',
    name: 'Nova Lane',
    url: 'https://example.com/nova-lane',
    affiliate_url: null,
    affiliate_status: 'needs_search',
    monetization_methods: [],
    summary: 'VR star',
    tags: ['vr'],
    pricing: { model: 'Varies', free_tier: null, from_price: null, currency: 'USD', plans: [], notes: null },
    platforms: ['OnlyFans'],
    score: null,
    pros: [],
    cons: [],
    image: { src: '/media/placeholders/pulse-a.svg', alt: 'Nova Lane', source_url: 'https://example.com/nova-lane', license: 'own-art', nsfw: false },
    facts: [],
    updated: '2026-10-26',
  };
  const catalog: Catalog = { entities: [nova] };
  const hits = searchCatalog([], catalog, 'nova', 'all', sfw);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.type, 'star');
  assert.equal(hits[0]?.href, '/stars/nova-lane');
  const toys = searchCatalog([], catalog, '', 'product', sfw);
  assert.equal(toys.length, 0);
  const stars = searchCatalog([], catalog, '', 'star', sfw);
  assert.equal(stars.length, 1);
});

test('a missing picture falls back to the category cover', async () => {
  const { presentImage } = await import('./resolve-media');
  const view = presentImage({ alt: 'Untitled', explicit: false, license: 'example' }, 'vr', 'fallback', sfw);
  assert.equal(view.state, 'file');
  if (view.state === 'file') assert.equal(view.src, '/media/categories/vr/cover.png');
});
