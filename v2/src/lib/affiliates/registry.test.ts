import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  effectiveOfferCapPercent,
  entityHasActiveAffiliate,
  goHref,
  hasAvoidVerdict,
  parseInlineSegments,
  resolveAffiliateLink,
  stripInlineTokens,
  type AffiliateLinkRecord,
} from './registry';
import type { Catalog, Entity } from '../content/types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    slug: 'spicychat',
    type: 'ai_app',
    name: 'SpicyChat',
    url: 'https://spicychat.ai',
    affiliate_url: 'https://spicychat.ai?ref=test123',
    affiliate_status: 'active',
    monetization_methods: ['affiliate'],
    summary: 'Hosted character chat.',
    tags: ['nsfw', 'character chat'],
    pricing: { model: 'Freemium', free_tier: 'Yes', from_price: '$5.95/mo', currency: 'USD', plans: [], notes: null },
    platforms: ['Web'],
    score: 8.4,
    pros: [],
    cons: [],
    image: null,
    facts: [],
    updated: '2026-10-27',
    ...overrides,
  };
}

describe('affiliate registry & /go/ resolution', () => {
  const spicy = makeEntity();
  const avoidApp = makeEntity({
    slug: 'crushon-ai',
    name: 'CrushOn AI',
    url: 'https://crushon.ai',
    affiliate_url: 'https://crushon.ai/?ref=abc',
    affiliate_status: 'active',
    cons: ['Trust review verdict: avoid — reported lack of cancel'],
  });
  const catalog: Catalog = { entities: [spicy, avoidApp] };

  it('resolves active registry link and falls back cleanly when paused or dead', () => {
    const links: AffiliateLinkRecord[] = [
      {
        link_id: 'lovense-lush-4',
        program_id: 'lovense',
        entity_slug: null,
        scope: 'product',
        tracked_url: 'https://lovense.com/r/lush4',
        fallback_link_id: 'lovense-home',
        priority: 10,
        status: 'paused',
      },
      {
        link_id: 'lovense-home',
        program_id: 'lovense',
        entity_slug: null,
        scope: 'home',
        tracked_url: 'https://lovense.com/r/home',
        priority: 100,
        status: 'active',
      },
    ];
    const resolved = resolveAffiliateLink('lovense-lush-4', catalog, links);
    assert.ok(resolved);
    assert.equal(resolved.resolvedLinkId, 'lovense-home');
    assert.equal(resolved.url, 'https://lovense.com/r/home');
    assert.equal(resolved.sponsored, true);
    assert.equal(resolved.resolution, 'fallback_link');
  });

  it('blocks affiliate promotion when an entity carries an avoid trust verdict', () => {
    assert.equal(hasAvoidVerdict(avoidApp), true);
    assert.equal(entityHasActiveAffiliate(avoidApp), false);
    const resolved = resolveAffiliateLink('crushon-ai', catalog, []);
    assert.ok(resolved);
    assert.equal(resolved.url, 'https://crushon.ai');
    assert.equal(resolved.sponsored, false);
    assert.equal(resolved.resolution, 'plain_fallback');
  });

  it('resolves active catalog entity slug when not overridden in registry', () => {
    const resolved = resolveAffiliateLink('spicychat', catalog, []);
    assert.ok(resolved);
    assert.equal(resolved.url, 'https://spicychat.ai?ref=test123');
    assert.equal(resolved.sponsored, true);
    assert.equal(resolved.resolution, 'entity_active');
  });

  it('parses inline go and internal tokens safely and blocks affiliate links in restricted blocks', () => {
    const line = 'Try [[go:spicychat|SpicyChat]] or read our [[internal:/story/best-ai-companion-apps-2026|Top 10 guide]] and skip [[internal:https://evil.example|bad]].';
    const parsed = parseInlineSegments(line, { allowAffiliate: true });
    assert.deepEqual(parsed, [
      { type: 'text', text: 'Try ' },
      { type: 'affiliate', linkId: 'spicychat', label: 'SpicyChat' },
      { type: 'text', text: ' or read our ' },
      { type: 'internal', href: '/story/best-ai-companion-apps-2026', label: 'Top 10 guide' },
      { type: 'text', text: ' and skip ' },
      { type: 'text', text: 'bad' },
      { type: 'text', text: '.' },
    ]);

    const restricted = parseInlineSegments('Quote about [[go:spicychat|SpicyChat]].', { allowAffiliate: false });
    assert.deepEqual(restricted, [
      { type: 'text', text: 'Quote about ' },
      { type: 'text', text: 'SpicyChat' },
      { type: 'text', text: '.' },
    ]);

    assert.equal(stripInlineTokens(line), 'Try SpicyChat or read our Top 10 guide and skip bad.');
  });

  it('computes dynamic weekly offer-cap without deadlocking on small partner counts', () => {
    assert.equal(effectiveOfferCapPercent(1), 100);
    assert.equal(effectiveOfferCapPercent(2), 50);
    assert.equal(effectiveOfferCapPercent(3), 34);
    assert.equal(effectiveOfferCapPercent(4), 30);
    assert.equal(effectiveOfferCapPercent(10), 30);
  });

  it('builds /go/ redirect URLs with optional article and slot attribution', () => {
    assert.equal(goHref('spicychat'), '/go/spicychat');
    assert.equal(
      goHref('spicychat', { articleSlug: 'best-ai-companion-apps-2026', slot: 'inline' }),
      '/go/spicychat?src=best-ai-companion-apps-2026&slot=inline',
    );
  });
});
