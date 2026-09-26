/**
 * policies.ts — deterministic policy validation (orchestrator-side only).
 * Pure functions over content; no agent involvement; no secrets; no URLs
 * resolved here except structural checks against the two canonical URL rules.
 */
import { WORD_COUNT_POLICY, END_RAIL_POLICY, RETIRED_POSITIONING, type Category } from '../../shared/brand';

export type DraftMeta = {
  category: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  body: string;
  tags?: string[];
  researchSource?: string | null;
  newsFit?: NewsFit | null;
};

export type NewsFit = {
  why_users_care: string;
  novelty_or_timeliness: string;
  primary_audience: string;
  category_exclusivity_reason: string;
  source_quality: 'high' | 'medium' | 'low';
  date_of_event: string | null;
  date_of_source: string;
  sensitive_content_risk: 'none' | 'low' | 'medium' | 'high';
  recommended_angle: string;
};

export type GateResult = { gate: string; pass: boolean; detail: string };

const INTERNAL_LINK_RE = /href="\/posts\/[a-z0-9-]+"/gi;
const RAW_AFFILIATE_HINTS = ['ref=', 'via=', '/r/', 'affiliate', 'aff_id'];
const AFFILIATE_HREF_RE = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi;

export function checkWordCount(d: DraftMeta): GateResult {
  const policy = WORD_COUNT_POLICY[d.category as Category];
  if (!policy) return { gate: 'word_count', pass: false, detail: `unknown category ${d.category}` };
  const words = d.body.trim().split(/\s+/).filter(Boolean).length;
  const pass = words >= policy.min && words <= policy.max;
  return { gate: 'word_count', pass, detail: `${words} words (policy ${policy.min}-${policy.max})` };
}

export function checkMeta(d: DraftMeta): GateResult {
  const mt = d.metaTitle ?? '';
  const md = d.metaDescription ?? '';
  const pass = mt.length >= 40 && mt.length <= 60 && md.length >= 120 && md.length <= 160;
  return { gate: 'meta_lengths', pass, detail: `metaTitle ${mt.length}/40-60, metaDescription ${md.length}/120-160` };
}

export function checkInternalLinks(d: DraftMeta): GateResult {
  const matches = d.body.match(INTERNAL_LINK_RE) ?? [];
  const pass = matches.length >= 2;
  return { gate: 'internal_links', pass, detail: `${matches.length} /posts/[slug] links (min 2)` };
}

export function checkNoRawAffiliateUrls(d: DraftMeta): GateResult {
  const offenders: string[] = [];
  for (const m of d.body.matchAll(AFFILIATE_HREF_RE)) {
    const url = m[1];
    if (RAW_AFFILIATE_HINTS.some(h => url.includes(h))) offenders.push(url);
  }
  const pass = offenders.length === 0;
  return { gate: 'no_raw_affiliate_urls', pass, detail: pass ? 'none in body' : `raw affiliate hrefs found (${offenders.length}) — must be renderer-injected only` };
}

export function checkRetiredPositioning(text: string): GateResult {
  const found = RETIRED_POSITIONING.filter(p => text.toLowerCase().includes(p.toLowerCase()));
  return { gate: 'brand_positioning', pass: found.length === 0, detail: found.length ? `retired positioning present: ${found.join(' | ')}` : 'clean' };
}

export function checkNewsFit(d: DraftMeta): GateResult {
  if (d.category !== 'industry-news') return { gate: 'news_fit', pass: true, detail: 'n/a' };
  const f = d.newsFit;
  if (!f) return { gate: 'news_fit', pass: false, detail: 'missing required news_fit record' };
  const required = ['why_users_care', 'novelty_or_timeliness', 'primary_audience', 'category_exclusivity_reason', 'source_quality', 'date_of_source', 'sensitive_content_risk', 'recommended_angle'];
  const missing = required.filter(k => (f as any)[k] === undefined || (f as any)[k] === null || (f as any)[k] === '');
  if (missing.length) return { gate: 'news_fit', pass: false, detail: `missing fields: ${missing.join(', ')}` };
  if (!f.why_users_care || f.why_users_care.trim().length < 20) return { gate: 'news_fit', pass: false, detail: 'why_users_care not credible (too thin)' };
  if (f.source_quality === 'low') return { gate: 'news_fit', pass: false, detail: 'source_quality low' };
  if (f.sensitive_content_risk === 'high') return { gate: 'news_fit', pass: false, detail: 'sensitive_content_risk high requires human review' };
  return { gate: 'news_fit', pass: true, detail: 'valid news_fit' };
}

export function checkMediaReadiness(media: { status: string; altText: string | null } | null): GateResult {
  if (!media) return { gate: 'media_ready', pass: false, detail: 'no primary media asset' };
  if (media.status !== 'ready') return { gate: 'media_ready', pass: false, detail: `media status ${media.status} (needs ready)` };
  if (!media.altText || media.altText.trim().length < 10) return { gate: 'media_ready', pass: false, detail: 'alt text missing or too short' };
  return { gate: 'media_ready', pass: true, detail: 'ready with usable alt text' };
}

export type EndRailValidation = {
  relatedPostSlugs: string[];
  affiliate: { mode: 'affiliate' | 'internal_only'; url?: string | null; disclosureRequired?: boolean } | null;
};

export function checkEndRail(rail: EndRailValidation | null, publishedSlugs: Set<string>): GateResult {
  if (!rail) return { gate: 'end_rail', pass: false, detail: 'no end-rail plan' };
  const validRelated = rail.relatedPostSlugs.filter(s => publishedSlugs.has(s));
  if (validRelated.length < END_RAIL_POLICY.relatedCountMin) {
    return { gate: 'end_rail', pass: false, detail: `no valid related posts (have ${validRelated.length}, need ${END_RAIL_POLICY.relatedCountMin})` };
  }
  if (rail.affiliate?.mode === 'affiliate' && !rail.affiliate.disclosureRequired) {
    return { gate: 'end_rail', pass: false, detail: 'affiliate CTA without disclosure requirement' };
  }
  return { gate: 'end_rail', pass: true, detail: `${validRelated.length} valid related posts; mode ${rail.affiliate?.mode ?? 'internal_only'}` };
}

export type StraightNewsCheck = { category: string; intentBrand: string | null };

export function checkStraightNewsNoAffiliate(d: DraftMeta & StraightNewsCheck, hasAffiliateCta: boolean): GateResult | null {
  if (d.category !== 'industry-news' || d.intentBrand != null) return null;
  return hasAffiliateCta
    ? { gate: 'straight_news_no_affiliate', pass: false, detail: 'straight news with forced affiliate CTA' }
    : { gate: 'straight_news_no_affiliate', pass: true, detail: 'internal-only as required' };
}

/** Run the full deterministic publish-gate suite. */
export function runPublishGates(args: {
  draft: DraftMeta & StraightNewsCheck;
  media: { status: string; altText: string | null } | null;
  endRail: EndRailValidation | null;
  publishedSlugs: Set<string>;
}): GateResult[] {
  const { draft, media, endRail, publishedSlugs } = args;
  const hasAffiliateCta = endRail?.affiliate?.mode === 'affiliate';
  const gates = [
    checkWordCount(draft),
    checkMeta(draft),
    checkInternalLinks(draft),
    checkNoRawAffiliateUrls(draft),
    checkRetiredPositioning(`${draft.title}\n${draft.body}\n${draft.metaTitle ?? ''}\n${draft.metaDescription ?? ''}`),
    checkNewsFit(draft),
    checkMediaReadiness(media),
    checkEndRail(endRail, publishedSlugs),
  ];
  const sn = checkStraightNewsNoAffiliate(draft, hasAffiliateCta);
  if (sn) gates.push(sn);
  return gates;
}
