import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateReturnBudget, runArticlePreflight } from './preflight';
import type { DraftArticleState } from './state';
import type { Catalog, Entity } from '../content/types';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    slug: 'spicychat',
    type: 'ai_app',
    name: 'SpicyChat',
    url: 'https://spicychat.ai',
    affiliate_url: 'https://spicychat.ai?ref=oge3yjk',
    affiliate_status: 'active',
    monetization_methods: ['affiliate'],
    summary: 'Hosted AI companion.',
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

function longParagraph(words = 320, extra = ''): string {
  return `${Array.from({ length: words }, (_, i) => `word${i}`).join(' ')} ${extra}`.trim();
}

function makeDraft(overrides: Partial<DraftArticleState> = {}): DraftArticleState {
  return {
    kind: 'article',
    slug: 'ai-sex-tech-news-2026',
    title: 'AI hardware sync update for 2026',
    dek: 'What changed across interactive firmware and companion sync this month.',
    topic: 'news',
    kind2: 'news',
    author: 'Pulse Desk',
    kicker: 'News',
    tags: ['ai', 'news'],
    entities: [],
    cover: { alt: 'AI news cover', url: '/media/categories/news/cover.png', license: 'brand-kit', explicit: false },
    images: [],
    sources: [{ label: 'Release notes', url: 'https://example.com/release', checked: '2026-11-20' }],
    checkedAt: '2026-11-20',
    blocks: [
      {
        type: 'p',
        text: longParagraph(320, 'See our [[internal:/story/best-ai-companion-apps-2026|AI companion rankings]].'),
      },
      {
        type: 'offer_block',
        block_id: 'read-next-lovense',
        variant: 'read_next_offer',
        bridge: 'Keep reading or explore sex tech',
        copy: 'Not covered above, but if you want interactive sync today, check out Lovense.',
        cta_label: 'Explore Lovense',
        link_id: 'lovense-home',
        read_next_slug: 'best-ai-companion-apps-2026',
        read_next_title: 'The 10 best AI companion apps in 2026',
      },
    ],
    ...overrides,
  };
}

describe('deterministic QC preflight engine', () => {
  const spicy = makeEntity();
  const crushonAvoid = makeEntity({
    slug: 'crushon-ai',
    name: 'CrushOn AI',
    url: 'https://crushon.ai',
    affiliate_url: 'https://crushon.ai/?ref=abc',
    affiliate_status: 'active',
    cons: ['Trust review verdict: avoid — no self-serve cancel'],
  });
  const catalog: Catalog = { entities: [spicy, crushonAvoid] };
  const registryLinks = [
    {
      link_id: 'lovense-home',
      program_id: 'lovense',
      entity_slug: null,
      scope: 'home' as const,
      tracked_url: 'https://lovense.com/r/live',
      priority: 100,
      status: 'active' as const,
    },
  ];

  it('passes a clean news article using a bottom Read-Next + Partner Spotlight offer_block', () => {
    const res = runArticlePreflight(makeDraft(), {
      publishedArticleSlugs: ['best-ai-companion-apps-2026'],
      catalog,
      registryLinks,
    });
    assert.equal(res.ok, true);
    assert.equal(res.affiliateLinkCount, 1);
    assert.equal(res.offerBlockCount, 1);
    assert.equal(res.issues.length, 0);
  });

  it('blocks synthetic probe slugs, broken /posts/ links, staging jargon, and avoid-verdict affiliate CTAs', () => {
    const bad = makeDraft({
      slug: 'probe-qc-draft-1',
      title: 'CrushOn review (v0.2 still under review)',
      blocks: [
        { type: 'h2', text: 'Try [[go:spicychat|SpicyChat]]' },
        { type: 'p', text: 'Read /posts/broken and [[go:crushon-ai|CrushOn]] or [[internal:/story/missing-slug|missing]].' },
      ],
    });
    const res = runArticlePreflight(bad, {
      publishedArticleSlugs: ['best-ai-companion-apps-2026'],
      catalog,
      registryLinks,
    });
    assert.equal(res.ok, false);
    const codes = new Set(res.issues.map((i) => i.code));
    assert.ok(codes.has('invalid-slug'));
    assert.ok(codes.has('staging-copy'));
    assert.ok(codes.has('legacy-posts-link'));
    assert.ok(codes.has('affiliate-in-restricted-block'));
    assert.ok(codes.has('avoid-entity-affiliate'));
    assert.ok(codes.has('broken-internal-link'));
    assert.ok(codes.has('thin-prose'));
  });

  it('enforces the return-count circuit breaker so stubborn drafts park cleanly', () => {
    assert.deepEqual(evaluateReturnBudget(0, 2), { action: 'retry', nextAttempt: 1 });
    assert.deepEqual(evaluateReturnBudget(1, 2), { action: 'retry', nextAttempt: 2 });
    const parked = evaluateReturnBudget(2, 2);
    assert.equal(parked.action, 'park');
  });
});
