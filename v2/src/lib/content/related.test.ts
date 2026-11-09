import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareGroups, relatedEntities, relatedForSearch, sameKindRelated } from './related';
import type { Entity, EntityType } from './entity-schema';
import type { Catalog } from './types';

function entity(partial: Partial<Entity> & { slug: string; type: EntityType }): Entity {
  return {
    name: 'Test Thing',
    url: 'https://example.com/',
    affiliate_url: null,
    affiliate_status: 'no_program',
    monetization_methods: [],
    summary: `${partial.slug} summary line.`,
    tags: [],
    pricing: { model: 'Unknown', free_tier: null, from_price: null, currency: 'USD', plans: [], notes: null },
    platforms: [],
    score: null,
    pros: [],
    cons: [],
    image: null,
    facts: [],
    updated: '2026-01-01',
    ...partial,
  };
}

const catalog = (entities: Entity[]): Catalog => ({ entities } as unknown as Catalog);

const LIST = [
  entity({ slug: 'star-a', type: 'star', tags: ['creator', 'american'], updated: '2026-03-01' }),
  entity({ slug: 'star-b', type: 'star', tags: ['creator', 'ustralian'], updated: '2026-03-04' }),
  entity({ slug: 'star-c', type: 'star', tags: ['director'], updated: '2026-03-02' }),
  entity({ slug: 'star-d', type: 'star', tags: [], updated: '2026-03-05' }),
  entity({ slug: 'site-a', type: 'site', tags: ['premium', 'hd'], updated: '2026-02-01' }),
  entity({ slug: 'site-b', type: 'site', tags: ['premium', 'studio'], updated: '2026-02-02' }),
  entity({ slug: 'ai-a', type: 'ai_app', tags: ['roleplay', 'local'], updated: '2026-04-01' }),
  entity({ slug: 'ai-b', type: 'ai_app', tags: ['roleplay'], updated: '2026-04-02' }),
];
const STORE = catalog(LIST);

describe('relatedEntities', () => {
  it('is deterministic across repeated runs (SSR stable)', () => {
    const one = relatedEntities(LIST[0], STORE);
    const two = relatedEntities(LIST[0], STORE);
    assert.deepEqual(one.map((entry) => entry.slug), two.map((entry) => entry.slug));
  });

  it('never includes the source entity itself', () => {
    for (const source of LIST) {
      const slugs = relatedEntities(source, STORE).map((item) => item.slug);
      assert.ok(!slugs.includes(source.slug));
    }
  });

  it('ranks same-topic tag neighbours above distant entities', () => {
    const related = relatedEntities(LIST[0], STORE).map((item) => item.slug);
    assert.equal(related[0], 'star-b');
    const last = related[related.length - 1];
    const lastEntity = LIST.find((item) => item.slug === last);
    assert.ok(lastEntity);
    assert.ok(['star-b', 'star-c', 'star-d'].includes(last));
  });

  it('excludes entities with no topic or tag overlap', () => {
    const lonelyList = [LIST[0], LIST[4]];
    const lonely = catalog(lonelyList);
    assert.deepEqual(relatedEntities(lonelyList[0], lonely).map((item) => item.slug), []);
  });

  it('caps the row at six', () => {
    const bigList = [
      ...Array.from({ length: 10 }, (_, index) => entity({ slug: `sib-${index}`, type: 'site', tags: ['premium'], updated: `2026-05-0${(index % 9) + 1}` })),
      LIST[4],
    ];
    const big = catalog(bigList);
    assert.ok(relatedEntities(bigList[bigList.length - 1], big).length <= 6);
  });
});

describe('sameKindRelated', () => {
  it('returns only the same display kind, capped at three', () => {
    const picks = sameKindRelated(LIST[0], STORE);
    assert.equal(picks.length, 3);
    assert.ok(picks.every((item) => item.type === 'star'));
  });

  it('gives the compare chip nothing when no sibling ranks', () => {
    const lonelyList = [LIST[0], LIST[4]];
    const lonely = catalog(lonelyList);
    assert.deepEqual(sameKindRelated(lonelyList[0], lonely), []);
  });
});

describe('relatedForSearch', () => {
  it('seeds off entity hits and excludes the hits themselves', () => {
    const hits = [
      { type: 'star' as const, href: '/stars/star-a' },
      { type: 'site' as const, href: '/sites/site-a' },
    ];
    const related = relatedForSearch(hits, STORE, []);
    const slugs = related.map((item) => item.slug);
    assert.ok(!slugs.includes('star-a'));
    assert.ok(!slugs.includes('site-a'));
    assert.ok(slugs.includes('star-b') || slugs.includes('site-b'));
  });

  it('seeds off article hits through the story entity list', () => {
    const hits = [{ type: 'article' as const, href: '/story/pick-1' }];
    const related = relatedForSearch(hits, STORE, [{ slug: 'pick-1', entitySlugs: ['ai-a'] }]);
    assert.ok(related.every((item) => item.slug !== 'ai-a'));
    assert.ok(related.map((item) => item.slug).includes('ai-b'));
  });

  it('returns nothing when hits carry no entities (article-only, no matches)', () => {
    assert.deepEqual(relatedForSearch([{ type: 'article' as const, href: '/story/ghost' }], STORE, []), []);
  });

  it('is deterministic across repeated runs', () => {
    const hits = [{ type: 'ai' as const, href: '/ai/ai-a' }];
    const one = relatedForSearch(hits, STORE, []).map((item) => item.slug);
    const two = relatedForSearch(hits, STORE, []).map((item) => item.slug);
    assert.deepEqual(one, two);
  });
});

describe('compareGroups', () => {
  it('only surfaces kinds with two or more hits, in hit order', () => {
    const hits = [
      { type: 'ai' as SearchHitFix['type'], href: '/ai/ai-a' },
      { type: 'article' as SearchHitFix['type'], href: '/story/pick-1' },
      { type: 'ai' as SearchHitFix['type'], href: '/ai/ai-b' },
      { type: 'star' as SearchHitFix['type'], href: '/stars/star-a' },
    ];
    const groups = compareGroups(hits as never, STORE);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, 'Compare 2 AI apps');
    assert.deepEqual(groups[0].ids, ['ai-a', 'ai-b']);
  });

  it('caps each chip at four ids', () => {
    const bigList = Array.from({ length: 6 }, (_, index) => entity({ slug: `byo-${index}`, type: 'frontend', updated: `2026-05-0${(index % 9) + 1}` }));
    const big = catalog(bigList);
    const hits = bigList.map((item) => ({ type: 'ai' as const, href: `/ai/${item.slug}` })).slice(0, 5);
    const groups = compareGroups(hits as never, big);
    assert.equal(groups[0].ids.length, 4);
  });
});

type SearchHitFix = { type: string; href: string };
