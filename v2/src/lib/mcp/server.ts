/**
 * MCP server surface (round 2E) — official SDK
 * (`@modelcontextprotocol/sdk` ^1.32) with `WebStandardStreamableHTTPServerTransport`,
 * the maintained Streamable HTTP transport that runs on Web-standard
 * Request/Response (Astro SSR / Cloudflare Workers).
 *
 * Deployed stateless (`sessionIdGenerator: undefined`) with JSON responses:
 * per the Streamable HTTP spec the endpoint answers POSTs with
 * application/json and 405s the GET/SSE streams it does not offer (the route
 * layer handles that). Scope comes from the bearer key, resolved before the
 * server is built, so nothing out of scope is even registered. Every tool
 * delegates to `lib/agent/service.ts` — the same validated layer the HTTP API
 * uses; the transport never reimplements business rules.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'astro/zod';
import type { AgentAuth } from '../agent/scopes';
import type { Store } from '../agent/store';
import type { DraftStatus, DraftState } from '../agent/state';
import {
  AgentError,
  affiliateUpsert,
  listAffiliateQueue,
  listDraftsFor,
  publishDraft,
  rollbackDraft,
  unpublishDraft,
  revisionsFor,
  agentSearchPublished,
  agentReadPublishedArticle,
  agentReadPublishedEntity,
  upsertDraft,
  type PublicRepo,
} from '../agent/service';
import { loadCompare, compareRows, compareSuggestions, parseCompareIds } from '../content/compare';
import type { SearchType } from '../content/types';

export type McpContext = {
  auth: AgentAuth;
  repo: PublicRepo;
  store: Store;
};

const SEARCH_TYPE_SET: ReadonlySet<string> = new Set(['all', 'article', 'star', 'site', 'ai', 'product', 'game']);

function jsonTool(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

/** Service errors become honest tool results with their codes — never crashes. */
function toolResult(error: unknown): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  if (error instanceof AgentError) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify({ error: error.code, message: error.message, ...error.extra }) }],
    };
  }
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: 'agent-internal', message: (error as Error)?.message ?? 'tool failed' }) }],
  };
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const mcp = new McpServer({ name: 'pulsensfw-content', version: '2.0.0' }, {
    capabilities: { tools: {} },
    instructions:
      'PulseNSFW content pipeline. Public reads cover published site content only. '
      + 'Draft-scope tools need the AGENT_DRAFT_KEY; publish-scope tools need the AGENT_PUBLISH_KEY; '
      + 'mutations require an idempotency key (identical retries replay the stored result).',
  });

  /* ---- Reads: any valid key (public content only) ---- */
  mcp.registerTool(
    'search_published',
    {
      title: 'Search published content',
      description: 'Full-text search over published site content (articles, stars, sites, AI, products, games). Never returns drafts.',
      inputSchema: {
        q: z.string().min(1),
        type: z.enum(['all', 'article', 'star', 'site', 'ai', 'product', 'game']).default('all'),
      },
    },
    async ({ q, type }) => {
      try {
        const resolved = (SEARCH_TYPE_SET.has(type) ? type : 'all') as SearchType;
        return jsonTool(await agentSearchPublished(ctx.repo, q, resolved));
      } catch (error) {
        return toolResult(error);
      }
    },
  );

  mcp.registerTool(
    'read_published',
    {
      title: 'Read a published record',
      description: 'Read one published article or entity (kind: article | star | site | ai | product | game).',
      inputSchema: {
        kind: z.enum(['article', 'star', 'site', 'ai', 'product', 'game']),
        slug: z.string().min(1),
      },
    },
    async ({ kind, slug }) => {
      try {
        if (kind === 'article') {
          return jsonTool(await agentReadPublishedArticle(ctx.repo, slug));
        }
        return jsonTool(await agentReadPublishedEntity(ctx.repo, kind, slug));
      } catch (error) {
        return toolResult(error);
      }
    },
  );

  mcp.registerTool(
    'compare_run',
    {
      title: 'Compare published entities',
      description: 'Side-by-side comparison of 2–4 published entities of the same kind, straight from catalog records (dash = missing fact).',
      inputSchema: {
        ids: z.string().min(3).describe('CSV of entity slugs, 2–4 of one kind'),
      },
    },
    async ({ ids }) => {
      try {
        const parsed = parseCompareIds(ids);
        const catalog = await ctx.repo.listCatalog();
        const state = loadCompare(catalog, parsed);
        if (state.status !== 'ok') return jsonTool({ status: state.status });
        return jsonTool({
          status: 'ok',
          kind: state.kindLabel,
          rows: compareRows(state.entities),
          more: compareSuggestions(catalog, state.entities).slice(0, 4).map((entity) => entity.slug),
        });
      } catch (error) {
        return toolResult(error);
      }
    },
  );

  /* ---- Drafts: draft scope ---- */
  if (ctx.auth.scope === 'draft') {
    mcp.registerTool(
      'list_drafts',
      {
        title: 'List drafts',
        description: 'Research/QC drafts in the agent store. Draft scope only.',
        inputSchema: {
          status: z.enum(['draft', 'in_review', 'published', 'rolled_back']).optional(),
        },
      },
      async ({ status }) => {
        try {
          return jsonTool(await listDraftsFor(ctx.store, ctx.auth, status ?? null));
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'draft_revisions',
      {
        title: 'Draft revision history',
        description: 'Append-only revision list for one slug. History is never erased.',
        inputSchema: { slug: z.string().min(1) },
      },
      async ({ slug }) => {
        try {
          return jsonTool(await revisionsFor(ctx.store, ctx.auth, slug));
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'upsert_draft',
      {
        title: 'Submit or revise a draft',
        description: 'Create or update a draft with an idempotency key. Optimistic base (revisionSeq + fingerprint) required for updates; full state replaces on publish. No duplicate revisions on identical retries.',
        inputSchema: {
          idempotencyKey: z.string().min(8).max(128),
          state: z.discriminatedUnion('kind', [
            z.object({
              kind: z.literal('article'),
              slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
              title: z.string().min(1),
              dek: z.string().min(1),
              topic: z.enum(['stars', 'sites', 'ai', 'toys', 'vr', 'guides', 'lists', 'news']),
              kind2: z.enum(['top_list', 'star_profile', 'site_review', 'review', 'guide', 'news']),
              author: z.string().min(1),
              kicker: z.string().min(1),
              tags: z.array(z.string()).default([]),
              entities: z.array(z.string()).default([]),
              cover: z.object({
                alt: z.string().min(1),
                url: z.string().optional(),
                sourceUrl: z.string().optional(),
                license: z.enum(['press-kit', 'affiliate-asset', 'screenshot', 'own-art', 'brand-kit', 'cc-by-4.0', 'cc-by-sa-4.0', 'cc-by-3.0', 'cc-by-sa-2.5', 'public-domain']),
                explicit: z.literal(false),
                plate: z.string().optional(),
                credit: z.string().optional(),
              }),
              sources: z.array(z.object({ label: z.string(), url: z.string(), checked: z.string().optional() })).default([]),
              checkedAt: z.string().nullable().optional(),
              blocks: z.array(z.union([
                z.object({ type: z.literal('p'), text: z.string() }),
                z.object({ type: z.literal('h2'), text: z.string() }),
                z.object({ type: z.literal('h3'), text: z.string() }),
                z.object({ type: z.literal('ul'), items: z.array(z.string()).min(1) }),
                z.object({ type: z.literal('quote'), text: z.string() }),
              ])).min(1),
            }),
            z.object({
              kind: z.literal('entity'),
              slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
              entity: z.record(z.string(), z.unknown()),
            }),
          ]),
          status: z.enum(['draft', 'in_review']).default('draft'),
          note: z.string().default(''),
          base: z.object({ revisionSeq: z.number().int().positive(), fingerprint: z.string().min(8) }).nullable().default(null),
        },
      },
      async ({ idempotencyKey, state, status, note, base }) => {
        try {
          const record = await upsertDraft(ctx.store, ctx.auth, {
            idempotencyKey,
            state: state as DraftState,
            status: status as DraftStatus,
            note,
            base,
          });
          return jsonTool({ slug: record.slug, revisionSeq: record.revisionSeq, status: record.status, fingerprint: record.fingerprint });
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'affiliate_upsert',
      {
        title: 'Queue affiliate metadata',
        description: 'Affiliate program metadata for one entity; the owner affiliate workflow consumes the queue. Draft scope only; affiliate status never affects scores or rank.',
        inputSchema: {
          idempotencyKey: z.string().min(8).max(128),
          slug: z.string().min(1),
          status: z.enum(['active', 'needs_search', 'program_found_signup_queued', 'no_program']),
          program_name: z.string().optional(),
          network: z.string().optional(),
          commission: z.string().optional(),
          signup_url: z.string().url().optional(),
          commission_days: z.number().int().nonnegative().optional(),
          note: z.string().optional(),
        },
      },
      async (input) => {
        try {
          return jsonTool(await affiliateUpsert(ctx.store, ctx.auth, { ...input, idempotencyKey: input.idempotencyKey }));
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'affiliate_queue',
      { title: 'List affiliate queue', description: 'Queued affiliate metadata (draft scope only).', inputSchema: {} },
      async () => {
        try {
          return jsonTool(await listAffiliateQueue(ctx.store, ctx.auth));
        } catch (error) {
          return toolResult(error);
        }
      },
    );
  }

  /* ---- Publication: publish scope only ---- */
  if (ctx.auth.scope === 'publish') {
    const publicationInput = {
      idempotencyKey: z.string().min(8).max(128),
      slug: z.string().min(1),
      expectedVersion: z.number().int().nonnegative().describe('Publication version you believe is current; 0 = expect none yet.'),
    };

    mcp.registerTool(
      'publish',
      {
        title: 'Publish a draft',
        description: 'Compare-and-set publication for one draft. Requires the AGENT_PUBLISH_KEY; a stale expectedVersion fails with the current version in the error.',
        inputSchema: publicationInput,
      },
      async ({ idempotencyKey, slug, expectedVersion }) => {
        try {
          return jsonTool(await publishDraft(ctx.store, ctx.auth, { idempotencyKey, slug, expectedVersion }));
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'unpublish',
      {
        title: 'Unpublish a draft',
        description: 'Remove content from the public overlay (history intact). Publish scope only; idempotency key required.',
        inputSchema: publicationInput,
      },
      async ({ idempotencyKey, slug, expectedVersion }) => {
        try {
          return jsonTool(await unpublishDraft(ctx.store, ctx.auth, { idempotencyKey, slug, expectedVersion }));
        } catch (error) {
          return toolResult(error);
        }
      },
    );

    mcp.registerTool(
      'rollback',
      {
        title: 'Roll a draft back',
        description: 'Create a NEW audited revision restoring an older state; the publication pointer is unpublished for QC review. History is never erased.',
        inputSchema: {
          idempotencyKey: z.string().min(8).max(128),
          slug: z.string().min(1),
          toSeq: z.number().int().positive(),
        },
      },
      async ({ idempotencyKey, slug, toSeq }) => {
        try {
          const record = await rollbackDraft(ctx.store, ctx.auth, { idempotencyKey, slug, toSeq });
          return jsonTool({ slug: record.slug, revisionSeq: record.revisionSeq, status: record.status });
        } catch (error) {
          return toolResult(error);
        }
      },
    );
  }

  return mcp;
}
