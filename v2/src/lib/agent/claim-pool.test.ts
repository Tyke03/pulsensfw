import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLAIM_TTL_DAYS,
  createResearchClaim,
  isClaimFresh,
  partitionClaims,
  pruneExpiredClaims,
  queryFreshClaims,
} from './claim-pool';

describe('N:1 research claim pool with volatility TTLs', () => {
  const baseTime = new Date('2026-11-01T00:00:00Z');

  it('assigns shorter TTLs to volatile categories (pricing/community) than static facts', () => {
    assert.ok(CLAIM_TTL_DAYS.pricing < CLAIM_TTL_DAYS.features);
    assert.ok(CLAIM_TTL_DAYS.community < CLAIM_TTL_DAYS.policy);
    assert.ok(CLAIM_TTL_DAYS.policy < CLAIM_TTL_DAYS.static);

    const priceClaim = createResearchClaim({
      claim_id: 'c-price',
      desk: 'ai',
      entity_slug: 'spicychat',
      category: 'pricing',
      claim_key: 'monthly_entry',
      claim_value: '$5.95/mo',
      source_url: 'https://spicychat.ai/pricing',
      evidence_type: 'first_party',
      checked_at: baseTime,
    });
    const staticClaim = createResearchClaim({
      claim_id: 'c-static',
      desk: 'ai',
      entity_slug: 'sillytavern',
      category: 'static',
      claim_key: 'license',
      claim_value: 'AGPL-3.0 open source',
      source_url: 'https://sillytavern.app/',
      evidence_type: 'first_party',
      checked_at: baseTime,
    });

    const day20 = new Date('2026-11-21T00:00:00Z');
    assert.equal(isClaimFresh(priceClaim, day20), false);
    assert.equal(isClaimFresh(staticClaim, day20), true);

    const { fresh, stale } = partitionClaims([priceClaim, staticClaim], day20);
    assert.deepEqual(fresh.map((c) => c.claim_id), ['c-static']);
    assert.deepEqual(stale.map((c) => c.claim_id), ['c-price']);
  });

  it('lets writers cherry-pick fresh cross-run citations while filtering out aggregators and stale claims', () => {
    const claims = [
      createResearchClaim({
        claim_id: 'c1',
        desk: 'ai',
        entity_slug: 'spicychat',
        category: 'features',
        claim_key: 'memory',
        claim_value: '16K context on paid plans',
        source_url: 'https://spicychat.ai/',
        evidence_type: 'first_party',
        tags: ['chat', 'memory'],
        checked_at: '2026-11-10T00:00:00Z',
      }),
      createResearchClaim({
        claim_id: 'c2',
        desk: 'ai',
        entity_slug: 'spicychat',
        category: 'pricing',
        claim_key: 'seo_price',
        claim_value: '$5',
        source_url: 'https://aggregator.example/',
        evidence_type: 'aggregator',
        tags: ['chat'],
        checked_at: '2026-11-15T00:00:00Z',
      }),
      createResearchClaim({
        claim_id: 'c3',
        desk: 'ai',
        entity_slug: 'spicychat',
        category: 'pricing',
        claim_key: 'old_price',
        claim_value: '$4.95/mo',
        source_url: 'https://spicychat.ai/',
        evidence_type: 'first_party',
        tags: ['chat'],
        checked_at: '2026-09-01T00:00:00Z',
      }),
    ];

    const now = new Date('2026-11-20T00:00:00Z');
    const usable = queryFreshClaims(claims, { desk: 'ai', tag: 'chat', excludeAggregator: true }, now);
    assert.deepEqual(usable.map((c) => c.claim_id), ['c1']);

    const remaining = pruneExpiredClaims(claims, now, 7);
    assert.deepEqual(remaining.map((c) => c.claim_id), ['c1', 'c2']);
  });
});
