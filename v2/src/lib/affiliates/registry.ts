import { supabaseAdmin, supabaseConfigured } from '../auth/supabase';
import { safePath } from '../http/safe-path';
import type { Entity } from '../content/entity-schema';
import type { Catalog } from '../content/types';

export type AffiliateLinkScope = 'home' | 'product' | 'bundle' | 'landing' | 'category' | 'coupon';
export type AffiliateLinkStatus = 'active' | 'paused' | 'dead';
export type AffiliateSlot = 'inline' | 'quicklinks' | 'offer' | 'dossier';

export type AffiliateLinkRecord = {
  link_id: string;
  program_id: string;
  entity_slug?: string | null;
  scope: AffiliateLinkScope;
  target?: string | null;
  tracked_url: string;
  fallback_link_id?: string | null;
  priority: number;
  status: AffiliateLinkStatus;
};

export type ResolvedAffiliateLink = {
  linkId: string;
  resolvedLinkId: string;
  url: string;
  sponsored: boolean;
  resolution: 'active' | 'fallback_link' | 'entity_active' | 'plain_fallback';
};

export type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'affiliate'; linkId: string; label: string }
  | { type: 'internal'; href: string; label: string };

const LINK_ID_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
const AVOID_RE = /\bverdict:\s*avoid\b/i;

export function isValidLinkId(linkId: string): boolean {
  return LINK_ID_RE.test(linkId);
}

/**
 * Editorial safety guardrail: entities flagged with an "avoid" trust verdict
 * must never be promoted with sponsored affiliate CTAs.
 */
export function hasAvoidVerdict(entity: Pick<Entity, 'cons' | 'facts' | 'summary'>): boolean {
  if (AVOID_RE.test(entity.summary)) return true;
  if (entity.cons.some((item) => AVOID_RE.test(item))) return true;
  if (entity.facts.some((fact) => AVOID_RE.test(fact.value) || (fact.notes ? AVOID_RE.test(fact.notes) : false))) {
    return true;
  }
  return false;
}

/** Whether an entity is eligible for a live sponsored affiliate CTA right now. */
export function entityHasActiveAffiliate(entity: Entity): boolean {
  return entity.affiliate_status === 'active' && Boolean(entity.affiliate_url) && !hasAvoidVerdict(entity);
}

/** Canonical on-site redirect URL so dead links can be fixed once and clicks counted without PII. */
export function goHref(
  linkId: string,
  opts?: { articleSlug?: string; slot?: AffiliateSlot },
): string {
  const params = new URLSearchParams();
  if (opts?.articleSlug) params.set('src', opts.articleSlug);
  if (opts?.slot) params.set('slot', opts.slot);
  const query = params.toString();
  return `/go/${encodeURIComponent(linkId)}${query ? `?${query}` : ''}`;
}

/**
 * Dynamic weekly offer-slot share cap.
 * Avoids mathematical deadlock when a desk has fewer than 4 active programs,
 * tightening automatically to 30% once 4+ programs are active.
 */
export function effectiveOfferCapPercent(activeProgramCount: number): number {
  const count = Math.max(1, Math.floor(activeProgramCount));
  return Math.max(30, Math.ceil(100 / count));
}

const INLINE_TOKEN_RE = /\[\[(go|internal):([^|\]]+)\|([^\]]+)\]\]/g;

/**
 * Parse safe inline link tokens inside body blocks.
 * - `[[go:<link_id>|<label>]]` -> `/go/<link_id>` (affiliate redirect; never accepts raw URLs)
 * - `[[internal:<relative-path>|<label>]]` -> validated relative on-site path
 * When `allowAffiliate` is false (headings, quotes, sources), affiliate tokens render as plain text.
 */
export function parseInlineSegments(
  text: string,
  opts: { allowAffiliate?: boolean } = {},
): InlineSegment[] {
  const allowAffiliate = opts.allowAffiliate ?? true;
  const segments: InlineSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, start) });
    }
    const kind = match[1];
    const target = (match[2] ?? '').trim();
    const label = (match[3] ?? '').trim();

    if (!label) {
      lastIndex = start + match[0].length;
      continue;
    }

    if (kind === 'go') {
      if (allowAffiliate && isValidLinkId(target)) {
        segments.push({ type: 'affiliate', linkId: target, label });
      } else {
        segments.push({ type: 'text', text: label });
      }
    } else if (kind === 'internal') {
      const cleaned = safePath(target, '');
      if (cleaned) {
        segments.push({ type: 'internal', href: cleaned, label });
      } else {
        segments.push({ type: 'text', text: label });
      }
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}

/** Strip inline link tokens to plain prose (for word counts, search excerpts, and reading time). */
export function stripInlineTokens(text: string): string {
  return text.replace(INLINE_TOKEN_RE, (_full, _kind, _target, label: string) => label.trim());
}

/** Load affiliate link rows from Supabase when service credentials are configured. */
export async function loadRegistryLinksFromSupabase(): Promise<AffiliateLinkRecord[]> {
  if (!supabaseConfigured()) return [];
  try {
    const { data, error } = await supabaseAdmin()
      .from('affiliate_links')
      .select('link_id, program_id, entity_slug, scope, target, tracked_url, fallback_link_id, priority, status');
    if (error || !Array.isArray(data)) return [];
    return data as AffiliateLinkRecord[];
  } catch {
    return [];
  }
}

/**
 * Resolve a `link_id` through the registry with automatic fallback when a link
 * is paused or dead, falling back finally to the matching entity's plain URL.
 */
export function resolveAffiliateLink(
  linkId: string,
  catalog: Catalog,
  registryLinks: AffiliateLinkRecord[] = [],
): ResolvedAffiliateLink | null {
  if (!isValidLinkId(linkId)) return null;
  const byId = new Map(registryLinks.map((row) => [row.link_id, row]));
  const entityBySlug = (slug: string | null | undefined): Entity | undefined =>
    slug ? catalog.entities.find((item) => item.slug === slug) : undefined;

  const start = byId.get(linkId);
  if (start) {
    const linkedEntity = entityBySlug(start.entity_slug);
    if (linkedEntity && hasAvoidVerdict(linkedEntity)) {
      return {
        linkId,
        resolvedLinkId: linkedEntity.slug,
        url: linkedEntity.url,
        sponsored: false,
        resolution: 'plain_fallback',
      };
    }

    // Walk explicit fallback chain while protecting against cycles.
    const seen = new Set<string>();
    let current: AffiliateLinkRecord | undefined = start;
    while (current && !seen.has(current.link_id)) {
      seen.add(current.link_id);
      if (current.status === 'active' && current.tracked_url) {
        return {
          linkId,
          resolvedLinkId: current.link_id,
          url: current.tracked_url,
          sponsored: true,
          resolution: current.link_id === linkId ? 'active' : 'fallback_link',
        };
      }
      current = current.fallback_link_id ? byId.get(current.fallback_link_id) : undefined;
    }

    // Fallback to another active link in the same program (most specific / lowest priority number first, then home).
    const programSibling = registryLinks
      .filter((row) => row.program_id === start.program_id && row.status === 'active' && Boolean(row.tracked_url))
      .sort((a, b) => (a.scope === 'home' ? 1 : 0) - (b.scope === 'home' ? 1 : 0) || a.priority - b.priority)[0];
    if (programSibling) {
      return {
        linkId,
        resolvedLinkId: programSibling.link_id,
        url: programSibling.tracked_url,
        sponsored: true,
        resolution: 'fallback_link',
      };
    }

    if (linkedEntity) {
      return {
        linkId,
        resolvedLinkId: linkedEntity.slug,
        url: linkedEntity.url,
        sponsored: false,
        resolution: 'plain_fallback',
      };
    }
    return null;
  }

  // Fallback directly to catalog entity slug (e.g. /go/spicychat).
  const directEntity = entityBySlug(linkId);
  if (!directEntity) return null;
  if (entityHasActiveAffiliate(directEntity) && directEntity.affiliate_url) {
    return {
      linkId,
      resolvedLinkId: directEntity.slug,
      url: directEntity.affiliate_url,
      sponsored: true,
      resolution: 'entity_active',
    };
  }
  return {
    linkId,
    resolvedLinkId: directEntity.slug,
    url: directEntity.url,
    sponsored: false,
    resolution: 'plain_fallback',
  };
}

/** Privacy-preserving click log (no IPs, no user IDs). Best-effort; never breaks redirects. */
export async function recordAffiliateClick(entry: {
  linkId: string;
  articleSlug?: string | null;
  slot?: string | null;
  resolvedStatus: string;
}): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    await supabaseAdmin().from('affiliate_clicks').insert({
      link_id: entry.linkId,
      article_slug: entry.articleSlug ? entry.articleSlug.slice(0, 120) : null,
      slot: entry.slot ? entry.slot.slice(0, 32) : null,
      resolved_status: entry.resolvedStatus,
    });
  } catch {
    // Click telemetry must never block or fail a reader redirect.
  }
}
