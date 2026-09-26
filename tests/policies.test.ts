import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPublishGates, checkWordCount, checkMeta, checkInternalLinks, checkNoRawAffiliateUrls,
  checkNewsFit, checkMediaReadiness, checkStraightNewsNoAffiliate, checkRetiredPositioning,
  type DraftMeta,
} from '../server/orchestrator/policies';
import { BRAND } from '../shared/brand';

const validNewsFit = {
  why_users_care: 'Readers actively use this platform and the change affects their access today.',
  novelty_or_timeliness: 'Announced yesterday; affects payments this week.',
  primary_audience: 'Adult platform users and creators',
  category_exclusivity_reason: 'Cross-cutting platform change, not specific to chatbots/sex-tech/VR',
  source_quality: 'high' as const,
  date_of_event: '2026-09-20',
  date_of_source: '2026-09-21',
  sensitive_content_risk: 'low' as const,
  recommended_angle: 'What the change means for subscribers this week',
};

const baseDraft = (over: Partial<DraftMeta> = {}): DraftMeta & { intentBrand: string | null } => ({
  category: 'ai-chatbots',
  title: 'A genuinely useful update arrives for NSFW AI companion platforms this month',
  metaTitle: 'NSFW AI companion platforms roll out a major memory upgrade',
  metaDescription: 'Major NSFW AI companion platforms changed memory handling and billing this month. Here is what changed, who it affects, and what to watch next.',
  body: `<p>Intro paragraph with real substance for readers who follow companion platforms.</p>
<h2>What changed</h2><p>Details of the change and who it affects, written plainly.</p>
<h2>Why it matters</h2><p><a href="/posts/some-related-post">related reading</a> and <a href="/posts/another-post">more</a></p>
<h2>What to watch</h2><p>Closing analysis with concrete next steps.</p>`,
  tags: ['ai-chatbots', 'platforms'],
  newsFit: null,
  intentBrand: null,
  ...over,
});

describe('deterministic gates', () => {
  it('case: word count policy per category', () => {
    const longBody = Array.from({ length: 820 }, (_, i) => `word${i}`).join(' ');
    assert.equal(checkWordCount(baseDraft({ body: longBody })).pass, true, '820-word draft passes');
    const short = baseDraft({ category: 'industry-news', body: '<p>too short</p>' });
    assert.equal(checkWordCount(short).pass, false);
  });

  it('case: meta lengths', () => {
    assert.equal(checkMeta(baseDraft()).pass, true);
    assert.equal(checkMeta(baseDraft({ metaTitle: 'tiny' })).pass, false);
  });

  it('case: internal links require /posts/[slug]', () => {
    assert.equal(checkInternalLinks(baseDraft()).pass, true);
    const bad = baseDraft({ body: '<p>no links here at all</p>' });
    assert.equal(checkInternalLinks(bad).pass, false);
  });

  it('case: raw affiliate URLs in body are banned', () => {
    const dirty = baseDraft({ body: '<p>x</p><a href="https://www.lovense.com/r/105l4a">buy</a>' });
    assert.equal(checkNoRawAffiliateUrls(dirty).pass, false);
    assert.equal(checkNoRawAffiliateUrls(baseDraft()).pass, true);
  });

  it('case 22: news_fit requires credible why_users_care', () => {
    const missing = baseDraft({ category: 'industry-news', newsFit: null });
    assert.equal(checkNewsFit(missing).pass, false);
    const thin = baseDraft({
      category: 'industry-news',
      newsFit: { ...validNewsFit, why_users_care: 'stuff happened' },
    });
    assert.equal(checkNewsFit(thin).pass, false);
    const good = baseDraft({ category: 'industry-news', newsFit: validNewsFit });
    assert.equal(checkNewsFit(good).pass, true);
  });

  it('case 20: low source quality and sensitive risk escalate', () => {
    const low = baseDraft({ category: 'industry-news', newsFit: { ...validNewsFit, source_quality: 'low' } });
    assert.equal(checkNewsFit(low).pass, false);
    const risky = baseDraft({ category: 'industry-news', newsFit: { ...validNewsFit, sensitive_content_risk: 'high' } });
    assert.equal(checkNewsFit(risky).pass, false);
  });

  it('cases 23/24/25: media readiness requires ready status + alt text + provenance fields', () => {
    assert.equal(checkMediaReadiness(null).pass, false);
    assert.equal(checkMediaReadiness({ status: 'proposed', altText: 'adequate alt text for testing' }).pass, false);
    assert.equal(checkMediaReadiness({ status: 'ready', altText: null }).pass, false);
    assert.equal(checkMediaReadiness({ status: 'ready', altText: 'Magenta pulse-wave hero with heart motif' }).pass, true);
  });

  it('case 19: brand positioning gate', () => {
    assert.equal(checkRetiredPositioning('Welcome to The NSFW Internet, Honestly Reviewed.').pass, false);
    assert.equal(checkRetiredPositioning(baseDraft().body).pass, true);
  });
});

describe('cases 32/33: the two URL rules never interchange', () => {
  it('editorial links are /posts/[slug]', () => {
    assert.equal(BRAND.urls.post('my-slug'), '/posts/my-slug');
    assert.equal(checkInternalLinks(baseDraft()).pass, true);
  });
  it('audit route is the hash form', () => {
    assert.equal(BRAND.urls.auditPost('my-slug'), 'https://pulsensfw.com/#/post/my-slug');
    assert.notEqual(BRAND.urls.auditPost('my-slug'), 'https://pulsensfw.com/posts/my-slug');
  });
});

describe('full publish gate suite (cases 10, 23, 24, 26, 29, 31)', () => {
  const publishedSlugs = new Set(['related-a', 'related-b']);

  it('publish-ready draft passes all gates', () => {
    const longBody = Array.from({ length: 820 }, (_, i) => `word${i}`).join(' ') + ' <a href="/posts/related-a">related</a> <a href="/posts/related-b">more</a>';
    const gates = runPublishGates({
      draft: baseDraft({ body: longBody }),
      media: { status: 'ready', altText: 'Magenta pulse-wave hero with heart motif' },
      endRail: {
        relatedPostSlugs: ['related-a', 'related-b'],
        affiliate: { mode: 'internal_only' },
      },
      publishedSlugs,
    });
    const failing = gates.filter(g => !g.pass);
    assert.deepEqual(failing, [], JSON.stringify(failing));
  });

  it('blocked when media not ready (case: needs_visual)', () => {
    const longBody = Array.from({ length: 820 }, (_, i) => `word${i}`).join(' ') + ' <a href="/posts/related-a">related</a> <a href="/posts/related-b">more</a>';
    const gates = runPublishGates({
      draft: baseDraft({ body: longBody }),
      media: { status: 'proposed', altText: 'x'.repeat(20) },
      endRail: { relatedPostSlugs: ['related-a'], affiliate: null },
      publishedSlugs,
    });
    assert.ok(gates.find(g => g.gate === 'media_ready' && !g.pass));
  });

  it('blocked when end-rail lacks valid related posts (case 26)', () => {
    const longBody = Array.from({ length: 820 }, (_, i) => `word${i}`).join(' ') + ' <a href="/posts/related-a">related</a> <a href="/posts/related-b">more</a>';
    const gates = runPublishGates({
      draft: baseDraft({ body: longBody }),
      media: { status: 'ready', altText: 'Magenta pulse-wave hero with heart motif' },
      endRail: { relatedPostSlugs: ['unpublished-draft'], affiliate: null },
      publishedSlugs,
    });
    assert.ok(gates.find(g => g.gate === 'end_rail' && !g.pass));
  });

  it('straight industry-news with forced affiliate fails the guard (case 31)', () => {
    const longBody = Array.from({ length: 620 }, (_, i) => `word${i}`).join(' ') + ' <a href="/posts/related-a">related</a> <a href="/posts/related-b">more</a>';
    const gates = runPublishGates({
      draft: baseDraft({ category: 'industry-news', newsFit: validNewsFit, intentBrand: null, body: longBody }),
      media: { status: 'ready', altText: 'Magenta pulse-wave hero with heart motif' },
      endRail: {
        relatedPostSlugs: ['related-a'],
        affiliate: { mode: 'affiliate', url: 'https://x.example/cta', disclosureRequired: true },
      },
      publishedSlugs,
    });
    const guard = gates.find(g => g.gate === 'straight_news_no_affiliate');
    assert.ok(guard && !guard.pass);
  });
});
