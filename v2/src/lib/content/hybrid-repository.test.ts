import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryAgentStore } from '../agent/memory-store';
import { upsertDraft, publishDraft } from '../agent/service';
import type { AgentAuth } from '../agent/scopes';
import { HybridContentRepository } from './hybrid-repository';
import type { Catalog, RawArticle } from './types';
import type { Entity, EntityType } from './entity-schema';

const draftKey: AgentAuth = { scope: 'draft', keyPrint: 'aaaa-bbbb' };
const publishKey: AgentAuth = { scope: 'publish', keyPrint: 'pppp-pppp' };

const localArticle: RawArticle = {
  slug: 'fixture-story',
  title: 'Fixture story',
  dek: 'Local seeded fixture dek.',
  topic: 'sites',
  kind: 'site_review',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  badges: [],
  author: 'Seed',
  kicker: 'Review',
  readingMinutes: 2,
  placement: 'stack',
  rails: [],
  tags: ['fixture'],
  cover: { alt: 'Cover', license: 'own-art', explicit: false },
  explicitImages: [],
  entitySlugs: [],
  sources: [],
  bodyText: 'Fixture body',
};

const baseEntity: Entity = {
  slug: 'fixture-entity',
  type: 'site',
  name: 'Fixture Entity',
  url: 'https://example.com/',
  affiliate_url: null,
  affiliate_status: 'needs_search',
  monetization_methods: [],
  summary: 'Seeded fixture entity.',
  tags: [],
  pricing: { model: 'Unknown', free_tier: null, from_price: null, currency: 'USD', plans: [], notes: null },
  platforms: [],
  score: null,
  pros: [],
  cons: [],
  image: null,
  facts: [],
  updated: '2026-01-01',
};

const baseRepo = {
  listArticles: async () => [localArticle],
  getArticle: async (slug: string) => (slug === localArticle.slug ? localArticle : null),
  listTopics: async () => [],
  listDeals: async () => [],
  listCatalog: async (): Promise<Catalog> => ({ entities: [baseEntity] }),
  getEntity: async (type: EntityType, slug: string) => (type === 'site' && slug === baseEntity.slug ? baseEntity : null),
  search: async () => [],
};

const agentArticleState = {
  kind: 'article' as const,
  slug: 'agent-story',
  title: 'Agent story',
  dek: 'Published through the agent pipeline.',
  topic: 'sites' as const,
  kind2: 'site_review' as const,
  author: 'QC',
  kicker: 'Review',
  tags: ['agent'],
  entities: ['fixture-entity'],
  cover: { alt: 'Agent cover', license: 'own-art' as const, explicit: false as const },
  sources: [],
  checkedAt: null,
  blocks: [
    { type: 'p' as const, text: 'Agent-published paragraph.' },
    { type: 'ul' as const, items: ['one', 'two'] },
  ],
  images: [],
};

async function hybrid(): Promise<{ repo: HybridContentRepository; store: MemoryAgentStore }> {
  const store = new MemoryAgentStore();
  const repo = new HybridContentRepository(baseRepo, store, 0) as unknown as HybridContentRepository;
  return { repo, store };
}

describe('hybrid content repository — publication visibility', () => {
  it('published agent posts appear in listArticles, read, and search', async () => {
    const { repo, store } = await hybrid();
    let before = await repo.listArticles();
    assert.equal(before.some((article) => article.slug === 'agent-story'), false);

    await upsertDraft(store, draftKey, { idempotencyKey: 'hy-create-1', state: agentArticleState, status: 'in_review', note: '', base: null });
    // Draft-only: still invisible.
    before = await repo.listArticles();
    assert.equal(before.some((article) => article.slug === 'agent-story'), false);

    await publishDraft(store, publishKey, { idempotencyKey: 'hy-pub-1', slug: 'agent-story', expectedVersion: 0 });
    const after = await repo.listArticles();
    const agentPost = after.find((article) => article.slug === 'agent-story');
    assert.ok(agentPost);
    assert.equal(agentPost?.bodyBlocks?.length, 2);
    const read = await repo.getArticle('agent-story');
    assert.equal(read?.title, 'Agent story');
    const hits = await repo.search('agent-published paragraph');
    assert.ok(hits.some((hit) => hit.href.includes('agent-story')));
  });

  it('unpublishing removes the record from public lists again', async () => {
    const { repo, store } = await hybrid();
    await upsertDraft(store, draftKey, { idempotencyKey: 'hy2-create-1', state: agentArticleState, status: 'in_review', note: '', base: null });
    const published = await publishDraft(store, publishKey, { idempotencyKey: 'hy2-pub-1', slug: 'agent-story', expectedVersion: 0 });
    const { unpublishDraft } = await import('../agent/service');
    await unpublishDraft(store, publishKey, { idempotencyKey: 'hy2-unpub-1', slug: 'agent-story', expectedVersion: published.version });
    const now = await repo.listArticles();
    assert.equal(now.some((article) => article.slug === 'agent-story'), false);
  });

  it('entity overrides replace the catalog record for published slugs', async () => {
    const { repo, store } = await hybrid();
    const updated: typeof baseEntity = { ...baseEntity, name: 'Updated Entity', affiliate_status: 'active', updated: '2026-11-01' };
    await upsertDraft(store, draftKey, {
      idempotencyKey: 'override-entity-1',
      state: { kind: 'entity', slug: 'fixture-entity', entity: updated },
      status: 'in_review',
      note: '',
      base: null,
    });
    await publishDraft(store, publishKey, { idempotencyKey: 'override-entity-pub-1', slug: 'fixture-entity', expectedVersion: 0 });
    const catalog = await repo.listCatalog();
    const entity = catalog.entities.find((row) => row.slug === 'fixture-entity');
    assert.equal(entity?.name, 'Updated Entity');
    assert.equal(entity?.affiliate_status, 'active');
  });

  it('unpublished-content isolation: drafts never reach reads even with store access', async () => {
    const { repo, store } = await hybrid();
    await upsertDraft(store, draftKey, { idempotencyKey: 'isol-create-1', state: agentArticleState, status: 'draft', note: '', base: null });
    assert.equal((await repo.getArticle('agent-story'))?.slug, undefined);
    assert.equal((await repo.listCatalog()).entities.some((entity) => entity.slug === 'agent-story'), false);
  });
});
