/**
 * Free deterministic QC preflight engine (runs before any LLM QC pass).
 *
 * Enforces:
 * - Clean slug (blocks synthetic probe / staging slugs)
 * - No staging or placeholder copy
 * - Minimum prose word count (excluding quick_links/offer_block chrome)
 * - Valid internal link resolution (stops broken /posts/ links)
 * - Valid active affiliate links by link_id (no raw affiliate URLs in prose,
 *   no affiliate links in headings/quotes, max 2 offer blocks)
 * - Entity-Sync & Avoid-Verdict disqualification (never promote an "avoid" entity)
 * - Return-count circuit breaker (parks stubborn drafts instead of looping forever)
 */
import type { DraftArticleState } from './state';
import type { Catalog } from '../content/types';
import { entityHref } from '../content/entities';
import {
  entityHasActiveAffiliate,
  hasAvoidVerdict,
  parseInlineSegments,
  resolveAffiliateLink,
  stripInlineTokens,
  type AffiliateLinkRecord,
} from '../affiliates/registry';

export type PreflightSeverity = 'error' | 'warning';
export type PreflightOwner = 'researcher' | 'writer' | 'affiliate' | 'system';

export type PreflightIssue = {
  code: string;
  severity: PreflightSeverity;
  owner: PreflightOwner;
  message: string;
};

export type PreflightResult = {
  ok: boolean;
  wordCount: number;
  affiliateLinkCount: number;
  offerBlockCount: number;
  issues: PreflightIssue[];
};

const SYNTHETIC_SLUG_RE = /(?:^|-)(?:probe|test-qc|qc-test|setup-sfw|draft-tmp|sandbox|dummy)(?:-|$)/i;
const STAGING_COPY_RE = /\b(?:TODO|TBD|Lorem ipsum|Layout demo|still under review|v0\.\d+|SES keys|provider keys not configured|Example names,\s*not real profiles|Fan-scout|Scam-hunt)\b/i;
const RAW_AFFILIATE_URL_RE = /https?:\/\/[^\s)]+(?:[?&](?:ref|aff|aff_id|clickid)=|\/r\/[a-z0-9]+)/i;
const LEGACY_POSTS_LINK_RE = /\/posts\//i;

const STATIC_ROUTES = new Set([
  '/',
  '/about',
  '/affiliate-disclosure',
  '/compare',
  '/concierge',
  '/contact',
  '/deals',
  '/editorial-policy',
  '/how-we-review',
  '/hubs',
  '/search',
  '/you',
  '/stars',
  '/sites',
  '/ai',
  '/toys',
  '/vr',
  '/guides',
  '/lists',
  '/news',
]);

export type PreflightOptions = {
  publishedArticleSlugs: Iterable<string>;
  catalog: Catalog;
  registryLinks?: AffiliateLinkRecord[];
  minWords?: number;
  requireAffiliateLink?: boolean;
};

export function runArticlePreflight(
  draft: DraftArticleState,
  opts: PreflightOptions,
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const publishedSlugs = new Set(opts.publishedArticleSlugs);
  const registryLinks = opts.registryLinks ?? [];
  const minWords = opts.minWords ?? (draft.kind2 === 'top_list' ? 500 : 300);
  const requireAffiliate = opts.requireAffiliateLink ?? true;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) || SYNTHETIC_SLUG_RE.test(draft.slug)) {
    issues.push({
      code: 'invalid-slug',
      severity: 'error',
      owner: 'writer',
      message: `Slug "${draft.slug}" is not a clean publication slug (remove probe/QC tags).`,
    });
  }

  if (!draft.title?.trim() || !draft.dek?.trim()) {
    issues.push({
      code: 'missing-head',
      severity: 'error',
      owner: 'writer',
      message: 'Title and dek are required.',
    });
  }

  if (!draft.cover || draft.cover.explicit || !draft.cover.alt?.trim() || draft.cover.license === 'example') {
    issues.push({
      code: 'invalid-cover',
      severity: 'error',
      owner: 'writer',
      message: 'Cover must be SFW with alt text and a non-example license.',
    });
  }

  // Staging/placeholder copy scan across title, dek, and prose blocks
  const textToScan = [
    draft.title,
    draft.dek,
    ...draft.blocks.flatMap((block) => {
      if (block.type === 'ul') return block.items;
      if (block.type === 'quick_links') return block.items.map((i) => `${i.label} ${i.note ?? ''}`);
      if (block.type === 'offer_block') return [block.bridge ?? '', block.copy, block.cta_label];
      return [block.text];
    }),
  ].join('\n');

  const stagingMatch = textToScan.match(STAGING_COPY_RE);
  if (stagingMatch) {
    issues.push({
      code: 'staging-copy',
      severity: 'error',
      owner: 'writer',
      message: `Found staging/internal phrasing "${stagingMatch[0]}" in draft copy.`,
    });
  }

  if (LEGACY_POSTS_LINK_RE.test(textToScan)) {
    issues.push({
      code: 'legacy-posts-link',
      severity: 'error',
      owner: 'writer',
      message: 'Legacy /posts/ link detected; use /story/<slug> for published articles.',
    });
  }

  const validEntityPaths = new Set(opts.catalog.entities.map((entity) => entityHref(entity.type, entity.slug)));
  const entityBySlug = new Map(opts.catalog.entities.map((entity) => [entity.slug, entity]));

  let wordCount = 0;
  let affiliateLinkCount = 0;
  let offerBlockCount = 0;
  const referencedAffiliateIds = new Set<string>();

  const checkInternalHref = (href: string) => {
    const pathname = href.split('?')[0]?.split('#')[0] ?? '';
    if (STATIC_ROUTES.has(pathname)) return;
    if (validEntityPaths.has(pathname)) return;
    if (pathname.startsWith('/story/')) {
      const slug = pathname.slice('/story/'.length);
      if (publishedSlugs.has(slug)) return;
    }
    issues.push({
      code: 'broken-internal-link',
      severity: 'error',
      owner: 'writer',
      message: `Internal link "${href}" does not resolve to a published article or catalog entity.`,
    });
  };

  const checkAffiliateId = (linkId: string, context: string) => {
    const resolved = resolveAffiliateLink(linkId, opts.catalog, registryLinks);
    if (!resolved || !resolved.sponsored) {
      const ent = entityBySlug.get(linkId);
      if (ent && hasAvoidVerdict(ent)) {
        issues.push({
          code: 'avoid-entity-affiliate',
          severity: 'error',
          owner: 'affiliate',
          message: `Blocked sponsored link "${linkId}" in ${context}: entity carries an "avoid" trust verdict. Use a clean alternative partner in the bottom bridge instead.`,
        });
      } else {
        issues.push({
          code: 'inactive-affiliate-link',
          severity: 'error',
          owner: 'affiliate',
          message: `Affiliate link "${linkId}" in ${context} does not resolve to an active registry link.`,
        });
      }
      return;
    }
    affiliateLinkCount += 1;
    referencedAffiliateIds.add(resolved.resolvedLinkId);
  };

  for (const block of draft.blocks) {
    if (block.type === 'h2' || block.type === 'h3' || block.type === 'quote') {
      if (/\[\[go:/.test(block.text)) {
        issues.push({
          code: 'affiliate-in-restricted-block',
          severity: 'error',
          owner: 'affiliate',
          message: `Affiliate links are forbidden inside ${block.type} blocks.`,
        });
      }
      if (RAW_AFFILIATE_URL_RE.test(block.text)) {
        issues.push({
          code: 'raw-affiliate-url',
          severity: 'error',
          owner: 'affiliate',
          message: `Raw affiliate URL found in ${block.type}; use link_id tokens only.`,
        });
      }
      wordCount += stripInlineTokens(block.text).split(/\s+/).filter(Boolean).length;
      continue;
    }

    if (block.type === 'p') {
      if (RAW_AFFILIATE_URL_RE.test(block.text)) {
        issues.push({
          code: 'raw-affiliate-url',
          severity: 'error',
          owner: 'affiliate',
          message: 'Raw affiliate URL found in paragraph; route through [[go:<link_id>|label]].',
        });
      }
      for (const seg of parseInlineSegments(block.text, { allowAffiliate: true })) {
        if (seg.type === 'affiliate') checkAffiliateId(seg.linkId, 'paragraph');
        if (seg.type === 'internal') checkInternalHref(seg.href);
      }
      wordCount += stripInlineTokens(block.text).split(/\s+/).filter(Boolean).length;
      continue;
    }

    if (block.type === 'ul') {
      for (const item of block.items) {
        if (RAW_AFFILIATE_URL_RE.test(item)) {
          issues.push({
            code: 'raw-affiliate-url',
            severity: 'error',
            owner: 'affiliate',
            message: 'Raw affiliate URL found in list item; route through [[go:<link_id>|label]].',
          });
        }
        for (const seg of parseInlineSegments(item, { allowAffiliate: true })) {
          if (seg.type === 'affiliate') checkAffiliateId(seg.linkId, 'list item');
          if (seg.type === 'internal') checkInternalHref(seg.href);
        }
        wordCount += stripInlineTokens(item).split(/\s+/).filter(Boolean).length;
      }
      continue;
    }

    if (block.type === 'quick_links') {
      for (const item of block.items) {
        checkAffiliateId(item.link_id, 'quick_links');
      }
      continue;
    }

    if (block.type === 'offer_block') {
      offerBlockCount += 1;
      checkAffiliateId(block.link_id, `offer_block:${block.block_id}`);
      if (block.read_next_slug) {
        checkInternalHref(`/story/${block.read_next_slug}`);
      }
      continue;
    }
  }

  // Count active dossier affiliate links for entities attached to this article (excluding avoid-verdict entities).
  for (const slug of draft.entities ?? []) {
    const entity = entityBySlug.get(slug);
    if (!entity) {
      issues.push({
        code: 'unknown-entity-slug',
        severity: 'error',
        owner: 'researcher',
        message: `Attached entity slug "${slug}" does not exist in the catalog.`,
      });
      continue;
    }
    if (entityHasActiveAffiliate(entity)) {
      affiliateLinkCount += 1;
      referencedAffiliateIds.add(entity.slug);
    }
  }

  if (offerBlockCount > 2) {
    issues.push({
      code: 'too-many-offer-blocks',
      severity: 'error',
      owner: 'affiliate',
      message: `Found ${offerBlockCount} offer blocks; maximum allowed per article is 2.`,
    });
  }

  if (wordCount < minWords) {
    issues.push({
      code: 'thin-prose',
      severity: 'error',
      owner: 'writer',
      message: `Article prose is ${wordCount} words (minimum ${minWords} words for ${draft.kind2}).`,
    });
  }

  if (requireAffiliate && affiliateLinkCount === 0) {
    issues.push({
      code: 'missing-affiliate-placement',
      severity: 'error',
      owner: 'affiliate',
      message: 'Article has 0 active affiliate placements. Place an eligible inline/quick-links link or a bottom Read-Next partner spotlight offer_block.',
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    wordCount,
    affiliateLinkCount,
    offerBlockCount,
    issues,
  };
}

export type ReturnBudgetOutcome =
  | { action: 'retry'; nextAttempt: number }
  | { action: 'park'; reason: string };

/** Circuit breaker so stubborn drafts park cleanly for the daily digest instead of burning tokens forever. */
export function evaluateReturnBudget(
  currentReturns: number,
  maxReturns = 2,
): ReturnBudgetOutcome {
  const next = currentReturns + 1;
  if (next > maxReturns) {
    return {
      action: 'park',
      reason: `Exceeded max QC return budget (${maxReturns}); parked for Brent's daily digest.`,
    };
  }
  return { action: 'retry', nextAttempt: next };
}
