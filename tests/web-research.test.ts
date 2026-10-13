import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAuthority, htmlToText, httpGet, gatherResearchMaterial,
  queriesFor, citableUrls, type WebSearchProvider, type SearchHit,
} from '../server/orchestrator/web-research';

describe('authority classification', () => {
  it('classifies known news hosts', () => {
    assert.equal(classifyAuthority('https://www.reuters.com/tech/story'), 'news');
    assert.equal(classifyAuthority('https://techcrunch.com/2026/x'), 'news');
  });
  it('classifies community hosts', () => {
    assert.equal(classifyAuthority('https://old.reddit.com/r/vr/comments/x'), 'community');
    assert.equal(classifyAuthority('https://news.ycombinator.com/item?id=1'), 'community');
  });
  it('classifies gov/edu as official; unknown hosts stay unknown', () => {
    assert.equal(classifyAuthority('https://ftp.gov/page'), 'official');
    assert.equal(classifyAuthority('https://some-blog.example.io/post'), 'unknown');
    assert.equal(classifyAuthority('not a url'), 'unknown');
  });
});

describe('htmlToText', () => {
  it('strips scripts/styles and extracts published hint', () => {
    const html = `<html><head><title>Hi</title><meta property="article:published_time" content="2026-10-01T00:00:00Z"></head>
      <body><script>var x="ignore";</script><style>.a{}</style><h1>T</h1><p>first para with plenty of words here</p><p>second paragraph also carrying real words</p></body></html>`;
    const r = htmlToText(html);
    assert.equal(r.title, 'Hi');
    assert.equal(r.publishedHint, '2026-10-01T00:00:00Z');
    assert.ok(!r.text.includes('ignore'));
    assert.ok(r.text.includes('first para'));
  });
});

describe('gatherResearchMaterial with injected provider', () => {
  const hits: SearchHit[] = [
    { title: 'A', url: 'https://reuters.com/a', snippet: 's1', authority: 'news' },
    { title: 'B', url: 'https://reddit.com/b', snippet: 's2', authority: 'community' },
    { title: 'C', url: 'https://vendor.example.io/c', snippet: 's3', authority: 'unknown' },
  ];

  it('prefers authoritative pages for deep fetch, keeps community hits visible', async () => {
    const fetched: string[] = [];
    const mat = await gatherResearchMaterial('vr', {
      transport: async (_q, limit) => hits.slice(0, limit),
      fetcher: async (url) => { fetched.push(url); return `<title>doc</title><p>${'word '.repeat(300)}</p>`; },
      maxHits: 3, maxDocs: 2,
    });
    assert.equal(mat.materialError, undefined);
    assert.equal(mat.hits.length, 3);
    assert.equal(mat.docs.length, 2);
    // news ranked ahead of community for doc fetch
    assert.ok(fetched[0] === 'https://reuters.com/a');
    assert.ok(mat.docs.every(d => d.text.length >= 400));
  });

  it('search failure → materialError set, agent must refuse, no docs', async () => {
    const mat = await gatherResearchMaterial('vr', {
      transport: async () => { throw new Error('search down'); },
      fetcher: async () => { throw new Error('never'); },
    });
    assert.ok(mat.materialError?.includes('search down'));
    assert.equal(mat.docs.length, 0);
  });

  it('empty result set → materialError; short fetched text skipped', async () => {
    const empty = await gatherResearchMaterial('vr', { transport: async () => [], fetcher: async () => 'never read' });
    assert.ok(empty.materialError);
    const short = await gatherResearchMaterial('vr', {
      transport: async () => [{ title: 'x', url: 'https://x.io/a', snippet: '', authority: 'unknown' }],
      fetcher: async () => '<title>t</title><p>too short</p>',
    });
    assert.equal(short.materialError, undefined);
    assert.equal(short.docs.length, 0);
  });

  it('citableUrls normalizes and unions hits+docs', async () => {
    const mat = await gatherResearchMaterial('vr', {
      transport: async () => [{ title: 'x', url: 'https://X.io/page?a=1', snippet: '', authority: 'news' }],
      fetcher: async () => `<title>t</title><p>${'word '.repeat(300)}</p>`,
      maxDocs: 1, maxHits: 1,
    });
    const set = citableUrls(mat);
    // normalized (query stripped, lowercased) form is citable
    assert.equal(set.has('https://x.io/page'.toLowerCase()), true);
  });
});

describe('build packet', () => {
  it('queriesFor returns category templates and honors extra query env', () => {
    delete process.env.RESEARCH_QUERY_EXTRA;
    const q = queriesFor('ai-chatbots');
    assert.ok(q.length >= 2);
    process.env.RESEARCH_QUERY_EXTRA = 'x';
    const q2 = queriesFor('ai-chatbots');
    assert.ok(q2.length === q.length + 1);
    process.env.RESEARCH_QUERY_EXTRA = '';
    delete process.env.RESEARCH_QUERY_EXTRA;
  });
});

describe('httpGet', () => {
  it('rejects oversized payloads', async () => {
    await assert.rejects(() => httpGet('data:too-large-not-actual'));
  });
});
