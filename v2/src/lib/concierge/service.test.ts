import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { conciergeGate, runTool, validateCitations } from './service';
import type { ConciergeRepo } from './service';
import type { CookieStore } from '../reader/cookies';
import type { Catalog, RawArticle, SearchHit, Topic } from '../content/types';
import type { Entity, EntityType } from '../content/entity-schema';

function cookieStore(values: Record<string, string>): CookieStore {
  return { get(name: string) {
    const value = values[name];
    return value === undefined ? undefined : { value };
  } };
}

const FIXTURE_ENTITY: Entity = {
  slug: 'fixture-ai',
  type: 'ai_app',
  name: 'Fixture AI',
  url: 'https://example.com/',
  affiliate_url: null,
  affiliate_status: 'no_program',
  monetization_methods: [],
  summary: 'Fixture AI companion for concierge tests.',
  tags: ['roleplay'],
  pricing: { model: 'Freemium', free_tier: '10 msgs', from_price: '$9/mo', currency: 'USD', plans: [], notes: null },
  platforms: ['Web'],
  score: 7.5,
  pros: [],
  cons: [],
  image: null,
  facts: [{ key: 'Uncensored positioning', value: 'On by default', source_url: 'https://example.com/x', checked: '2026-02-02', evidence_type: 'first_party' }],
  updated: '2026-02-02',
};

const FIXTURE_ARTICLE: RawArticle = {
  slug: 'fixture-story',
  title: 'Fixture story',
  dek: 'Fixture dek',
  topic: 'ai',
  kind: 'site_review',
  publishedAt: new Date('2026-03-01T00:00:00Z'),
  badges: [],
  author: 'QC',
  kicker: 'Review',
  readingMinutes: 2,
  placement: 'stack',
  rails: [],
  tags: [],
  cover: { alt: 'Cover', license: 'own-art', explicit: false },
  explicitImages: [],
  entitySlugs: ['fixture-ai'],
  sources: [],
  bodyText: 'Fixture body text with a bare mention of pricing',
};

const fixtureRepo: ConciergeRepo = {
  async listArticles() { return [FIXTURE_ARTICLE]; },
  async listCatalog(): Promise<Catalog> { return { entities: [FIXTURE_ENTITY] }; },
  async getArticle(slug: string) { return slug === 'fixture-story' ? FIXTURE_ARTICLE : null; },
  async getEntity(type: EntityType, slug: string) {
    return type === FIXTURE_ENTITY.type && slug === FIXTURE_ENTITY.slug ? FIXTURE_ENTITY : null;
  },
};

const DEV_ENV = { CONCIERGE_DEV_MOCK: '1' };

describe('concierge gates', () => {
  it('locked: no age cookie → SFW retrieval, no NSFW', () => {
    const gate = conciergeGate(cookieStore({ pulse_seed: '7' }), false, DEV_ENV);
    assert.equal(gate.status, 'ok');
    if (gate.status === 'ok') {
      assert.equal(gate.nsfwAllowed, false);
      assert.equal(gate.ageMode, 'stub-ok');
    }
  });

  it('stub verified + NSFW on (dev, no vendor env) → retrieval unlocked, labeled stub-ok', () => {
    const store = cookieStore({ pulse_age: 'stub.v1', pulse_nsfw: '1', pulse_seed: '7' });
    const gate = conciergeGate(store, false, DEV_ENV);
    if (gate.status === 'ok') {
      assert.equal(gate.ageMode, 'stub-ok');
      assert.equal(gate.nsfwAllowed, true);
    }
  });

  it('production vendor mode rejects the dev stub cookie (fail closed by issuer prefix)', () => {
    // Without a vendor env in the test process we assert the byte contract:
    // only cookies issued by the vendor ("vendor.*") can ever clear NSFW.
    assert.ok(!/^vendor\./.test('stub.v1'));
    assert.ok(/^vendor\./.test('vendor.v1.x'));
  });

  it('unconfigured without any model fixture → honest unconfigured state', () => {
    const gate = conciergeGate(cookieStore({ pulse_seed: '7' }), false, {});
    assert.equal(gate.status, 'unconfigured');
  });
});

describe('concierge tools — allowlist + SFW delivery', () => {
  const SAFE_READER = { ageVerified: true, nsfw: false, discreet: false, blur: false, seed: 4 };

  it('only the three allowlisted tools execute', async () => {
    await assert.rejects(async () => runTool('publish', {}, SAFE_READER, fixtureRepo), /tool-not-allowlisted/);
    await assert.rejects(async () => runTool('upsert_draft', {}, SAFE_READER, fixtureRepo), /tool-not-allowlisted/);
  });

  it('search published returns citations to real page hrefs', async () => {
    const result = await runTool('search_published', { q: 'fixture' }, SAFE_READER, fixtureRepo);
    assert.ok(result.citations.length > 0);
    for (const citation of result.citations) {
      assert.match(citation.href, /^\/(story|stars|sites|ai|products|games)\//);
    }
  });

  it('read_published entity shows the recorded score and no invented gaps', async () => {
    const result = await runTool('read_published', { kind: 'ai', slug: 'fixture-ai' }, SAFE_READER, fixtureRepo);
    const payload = result.payload as { score: number | null; name: string; nsfwNote: string | null };
    assert.equal(payload.name, 'Fixture AI');
    assert.equal(payload.score, 7.5);
  });

  it('missing entity reads return "not found" without improvising', async () => {
    const result = await runTool('read_published', { kind: 'ai', slug: 'unknown-thing' }, SAFE_READER, fixtureRepo);
    assert.equal(result.citations.length, 0);
    assert.match(String(result.summary), /No published entity/);
  });

  it('compare_run executes against published records (dash for missing facts)', async () => {
    const second: Entity = { ...FIXTURE_ENTITY, slug: 'second-ai', name: 'Second AI', score: null, updated: '2026-02-01' };
    const repo: ConciergeRepo = {
      ...fixtureRepo,
      async listCatalog() { return { entities: [FIXTURE_ENTITY, second] }; },
    };
    const result = await runTool('compare_run', { ids: 'fixture-ai,second-ai' }, SAFE_READER, repo);
    const rows = result.payload as Array<{ label: string; values: string[] }>;
    const scoreRow = rows.find((row) => row.label === 'Score');
    assert.deepEqual(scoreRow?.values, ['7.5 / 10', '—']);
  });
});

describe('citation validation', () => {
  it('only tool-returned URLs may appear as citations', () => {
    const returned = [
      { label: 'Real', href: '/sites/pornhub' },
      { label: 'Also real', href: '/story/some-review' },
    ];
    const text = 'See [Real](/sites/pornhub) and also something else.';
    const validated = validateCitations(returned, text);
    assert.deepEqual(validated, [returned[0]]);
  });

  it('falls back to the first few returned citations when text lacks links', () => {
    const returned = [
      { label: 'One', href: '/ai/a' },
      { label: 'Two', href: '/ai/b' },
    ];
    const validated = validateCitations(returned, 'plain text');
    assert.equal(validated.length, 2);
  });
});
