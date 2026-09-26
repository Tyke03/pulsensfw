import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRegistryEligibility, matchLovense, loadLovenseLinks, resolveEndRailAffiliate,
  type RegistryRow, type LovenseLinksFile,
} from '../server/orchestrator/affiliate-resolution';
import { selectRelatedPosts, validateEndRailPlan } from '../server/orchestrator/end-rail';
import { AGENTS } from '../server/orchestrator/packages';
import { RETIRED_POSITIONING, CATEGORIES } from '../shared/brand';
import fs from 'node:fs';
import path from 'node:path';

const healthyRow: RegistryRow = { id: 1, name: 'CrushOn.AI', url: 'https://registry-resolved.example/cta', category: 'ai-chatbots', active: true, trackingStatus: 'real' };

describe('affiliate registry eligibility', () => {
  it('case 11: resolves a registry row at runtime (no hardcoded URL in agent output)', () => {
    const r = evaluateRegistryEligibility({ registry: healthyRow, health: 'healthy', contextuallyRelevant: true });
    assert.equal(r.eligible, true);
  });

  it('blocks inactive rows and unhealthy statuses (cases 15, 17)', () => {
    assert.equal(evaluateRegistryEligibility({ registry: { ...healthyRow, active: false }, health: 'healthy', contextuallyRelevant: true }).eligible, false);
    for (const h of ['redirect_to_home', 'rate_limited_inconclusive', 'broken', 'disabled', 'expired', 'unknown'] as const) {
      const r = evaluateRegistryEligibility({ registry: healthyRow, health: h, contextuallyRelevant: true });
      assert.equal(r.eligible, false, `health ${h} must be ineligible`);
    }
  });
});

describe('Lovense SKU matching (cases 13, 14)', () => {
  const file = loadLovenseLinks();
  it('loads the supplied lovense-links.json', () => {
    assert.ok(file, 'lovense file should load');
    assert.equal(file!.brand, 'Lovense');
  });

  it('matches exact standalone product with highest priority', () => {
    const m = matchLovense('Review of the Lovense Edge 2 prostate massager', file);
    assert.equal(m.tier, 'product');
    assert.equal(m.name, 'Edge 2');
    assert.ok(m.url!.includes('/r/'));
  });

  it('matches bundle when two bundle products appear', () => {
    const m = matchLovense('Long distance couples guide covering the Nora rabbit vibrator and the Max 2', file);
    assert.equal(m.tier, 'bundle');
  });

  it('matches landing page for topic content', () => {
    const m = matchLovense('How the Lovense Remote app and bluetooth control work', file);
    assert.equal(m.tier, 'landing_page');
  });

  it('never guesses a standalone URL for url:null products (Lush 4 alone)', () => {
    const m = matchLovense('The Lush 4 g-spot vibrator in depth', file);
    assert.equal(m.url, null);
    assert.ok(['ineligible_fallback', 'no_match'].includes(m.tier));
  });

  it('case 14: home fallback is ineligible by default (redirect-to-home)', () => {
    // Lush 4 alone = genuine Lovense relevance (keywords match) but the product
    // has url:null and the home fallback is redirect-to-home ineligible.
    const m = matchLovense('The Lush 4 wearable vibrator overview', file);
    assert.equal(m.url, null);
    assert.equal(m.tier, 'ineligible_fallback');
    assert.match(m.reason, /redirect_to_home/);
    // Pure brand mention with zero keyword relevance is a clean no_match.
    const brandOnly = matchLovense('Lovense is a widely known intimacy brand worth noting', file);
    assert.equal(brandOnly.tier, 'no_match');
  });

  it('fallback can only be enabled explicitly (config-gated)', () => {
    const m = matchLovense('Lovense is a widely known intimacy brand worth noting', file, { allowHomeFallback: true });
    assert.equal(m.tier, 'home_fallback');
    assert.ok(m.url!.includes('/r/3ss45r'));
  });
});

describe('end-rail resolution (cases 28, 29, 31)', () => {
  const lovense = loadLovenseLinks();
  const registry: RegistryRow[] = [
    healthyRow,
    { id: 2, name: 'Lovense', url: 'https://www.lovense.com/?ref=pulsensfw', category: 'sex-tech', active: true, trackingStatus: 'real' },
  ];

  it('resolves an eligible affiliate CTA with disclosure', () => {
    const r = resolveEndRailAffiliate({
      intentBrand: 'CrushOn.AI', draftText: 'review of a chatbot', registryRows: registry,
      healthByAffiliateId: new Map([[1, 'healthy']]), lovenseFile: lovense, isStraightNews: false,
    });
    assert.equal(r.mode, 'affiliate');
    assert.equal(r.disclosureRequired, true);
  });

  it('falls back to internal_only when no eligible match', () => {
    const r = resolveEndRailAffiliate({
      intentBrand: null, draftText: '', registryRows: registry,
      healthByAffiliateId: new Map(), lovenseFile: lovense, isStraightNews: false,
    });
    assert.equal(r.mode, 'internal_only');
  });

  it('case 31: straight news never gets a forced affiliate CTA', () => {
    const r = resolveEndRailAffiliate({
      intentBrand: null, draftText: 'platform policy change', registryRows: registry,
      healthByAffiliateId: new Map(), lovenseFile: lovense, isStraightNews: true,
    });
    assert.equal(r.mode, 'internal_only');
    assert.match(r.reason, /straight_news/);
  });

  it('Lovense intent with ineligible fallback resolves internal_only', () => {
    const r = resolveEndRailAffiliate({
      intentBrand: 'Lovense', draftText: 'An overview of the Lush 4 wearable vibrator', registryRows: registry,
      healthByAffiliateId: new Map([[2, 'healthy']]), lovenseFile: lovense, isStraightNews: false,
    });
    assert.equal(r.mode, 'internal_only');
    assert.match(r.reason, /redirect_to_home|fallback_ineligible/);
  });
});

describe('related-post selection (cases 26, 27)', () => {
  const now = new Date();
  const mk = (id: number, slug: string, category: string, days = 1): any => ({
    id, slug, title: `T ${slug}`, category, tags: [category], publishedAt: new Date(now.getTime() - days * 86400000),
  });

  it('selects up to 3 published related posts, category-prioritized', () => {
    const r = selectRelatedPosts({
      currentSlug: 'current', currentCategory: 'vr',
      candidates: [mk(1, 'a', 'vr'), mk(2, 'b', 'vr'), mk(3, 'c', 'sex-tech'), mk(4, 'd', 'vr')],
    });
    assert.equal(r.selected.length, 3);
    assert.equal(r.selected.filter(p => p.category === 'vr').length, 3);
  });

  it('never selects the current post or unpublished items', () => {
    const r = selectRelatedPosts({
      currentSlug: 'current', currentCategory: 'vr',
      candidates: [mk(1, 'current', 'vr'), mk(2, 'draft-one', 'vr', 2), { ...mk(3, 'x', 'vr'), publishedAt: null }],
    });
    assert.ok(!r.selected.some(p => p.slug === 'current'));
    assert.equal(r.droppedCurrentPost, true);
    assert.ok(r.selected.every(p => p.slug !== 'x'));
  });
});

describe('case 10: no hardcoded affiliate URLs in prompts/code/templates', () => {
  it('prompt packages contain no tracked affiliate URL patterns', () => {
    for (const agent of AGENTS) {
      assert.doesNotMatch(agent.systemPrompt, /lovense\.com\/r\//i, `${agent.id} must not contain Lovense URLs`);
      assert.doesNotMatch(agent.systemPrompt, /ref=nzflztr|ref=oge3yjk|via=pulsensfw/, `${agent.id} must not contain tracked ref codes`);
      assert.doesNotMatch(JSON.stringify(agent.buildWorkPacket({})), /lovense\.com\/r\//i, `${agent.id} work packet must not contain URLs`);
    }
  });

  it('renderer/templates contain no tracked affiliate URLs', () => {
    const rail = fs.readFileSync(path.resolve(process.cwd(), 'client/src/components/ArticleEndRail.tsx'), 'utf-8');
    assert.doesNotMatch(rail, /lovense\.com|crushon\.ai|spicychat\.ai|theresanaiforthat\.com/i);
  });
});

describe('case 18: retired brand positioning absent from active surfaces', () => {
  it('no active source file carries the retired positioning', () => {
    const roots = ['client/src', 'server', 'shared', 'prompts'];
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) { scan(p); continue; }
        if (!/\.(ts|tsx|md|html|json)$/.test(f.name)) continue;
        const text = fs.readFileSync(p, 'utf-8');
        for (const phrase of RETIRED_POSITIONING) {
          if (text.includes(phrase) && !p.includes('brand.ts')) offenders.push(`${p}: ${phrase}`);
        }
      }
    };
    roots.forEach(scan);
    assert.deepEqual(offenders, []);
  });
});
