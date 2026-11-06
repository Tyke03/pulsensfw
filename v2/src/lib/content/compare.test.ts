import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareRows, loadCompare, parseCompareIds } from './compare';
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

describe('parseCompareIds', () => {
  it('trims, lowercases and dedupes the ids CSV', () => {
    assert.deepEqual(parseCompareIds(' a, B ,a,c-d '), ['a', 'b', 'c-d']);
  });

  it('drops non-slug fragments and caps at four', () => {
    assert.deepEqual(parseCompareIds('ok,bad_thing,one,two,three,four'), ['ok', 'one', 'two', 'three']);
    assert.deepEqual(parseCompareIds('ok,1'), ['ok', '1']);
  });

  it('returns empty for missing or empty links', () => {
    assert.deepEqual(parseCompareIds(null), []);
    assert.deepEqual(parseCompareIds(',,,'), []);
  });
});

describe('loadCompare', () => {
  const store = catalog([
    entity({ slug: 'alpha', type: 'site', score: 8.2 }),
    entity({ slug: 'beta', type: 'site' }),
    entity({ slug: 'gamma', type: 'ai_app' }),
    entity({ slug: 'delta', type: 'ai_app' }),
  ]);

  it('accepts 2–4 same-kind entities and reports the kind', () => {
    const state = loadCompare(store, ['alpha', 'beta']);
    assert.equal(state.status, 'ok');
    if (state.status === 'ok') {
      assert.equal(state.kind, 'site');
      assert.equal(state.entities.length, 2);
    }
  });

  it('groups AI frontends and hosted apps under one kind', () => {
    const state = loadCompare(
      catalog([entity({ slug: 'hosted', type: 'ai_app' }), entity({ slug: 'byo', type: 'frontend' })]),
      ['hosted', 'byo'],
    );
    assert.equal(state.status, 'ok');
    if (state.status === 'ok') assert.equal(state.kind, 'ai');
  });

  it('rejects mixed kinds with readable labels', () => {
    const state = loadCompare(store, ['alpha', 'gamma']);
    assert.equal(state.status, 'mixed');
    if (state.status === 'mixed') assert.deepEqual(state.kindLabels, ['Site', 'AI app']);
  });

  it('calls out unknown slugs', () => {
    const state = loadCompare(store, ['alpha', 'nope']);
    assert.equal(state.status, 'unknown-id');
    if (state.status === 'unknown-id') assert.deepEqual(state.missing, ['nope']);
  });

  it('marks a single id as too few', () => {
    const state = loadCompare(store, ['alpha']);
    assert.equal(state.status, 'too-few');
  });

  it('marks an all-unknown link without pretending it is a comparison', () => {
    const state = loadCompare(store, ['nope', 'nah']);
    assert.equal(state.status, 'unknown-id');
  });

  it('returns empty state with no ids', () => {
    assert.equal(loadCompare(store, []).status, 'empty');
  });
});

describe('compareRows', () => {
  it('never invents data: missing score, pricing and notes are dashes', () => {
    const rows = compareRows([entity({ slug: 'flat', type: 'site' })]);
    const byLabel = new Map(rows.map((row) => [row.label, row.values[0]]));
    assert.equal(byLabel.get('Score'), '—');
    assert.equal(byLabel.get('Pricing'), '—');
    assert.equal(byLabel.get('Platforms'), '—');
    assert.equal(byLabel.get('NSFW mode'), '—');
    assert.equal(byLabel.get('Pros'), '—');
  });

  it('shows only what the record carries', () => {
    const rows = compareRows([
      entity({
        slug: 'rich',
        type: 'ai_app',
        score: 7.5,
        platforms: ['Web', 'Local'],
        pricing: { model: 'Freemium', free_tier: '10 msgs', from_price: '$9/mo', currency: 'USD', plans: [], notes: null },
        pros: ['one', 'two', 'three', 'four dropped'],
        facts: [{ key: 'Uncensored positioning', value: 'On by default', source_url: 'https://example.com/x', checked: '2026-02-02', evidence_type: 'first_party' }],
      }),
    ]);
    const byLabel = new Map(rows.map((row) => [row.label, row.values[0]]));
    assert.equal(byLabel.get('Score'), '7.5 / 10');
    assert.equal(byLabel.get('Pricing'), '$9/mo · Freemium');
    assert.equal(byLabel.get('Platforms'), 'Web · Local');
    assert.equal(byLabel.get('NSFW mode'), 'Uncensored positioning: On by default');
    assert.equal(byLabel.get('Pros'), 'one · two · three');
  });

  it('aligns values with entity order', () => {
    const rows = compareRows([
      entity({ slug: 'a', type: 'site', score: 6 }),
      entity({ slug: 'b', type: 'site', score: null }),
    ]);
    const score = rows.find((row) => row.label === 'Score');
    assert.deepEqual(score?.values, ['6.0 / 10', '—']);
  });
});
