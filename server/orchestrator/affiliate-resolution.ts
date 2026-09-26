/**
 * affiliate-resolution.ts — runtime affiliate resolution (orchestrator-only).
 * The prompt agents never see URLs; they propose intent. This module resolves
 * intent against the canonical Neon `affiliates` registry and, for Lovense,
 * the SKU-level lovense-links.json second tier. Health status gates everything.
 *
 * Lovense home-page fallback is INELIGIBLE by default: PIPELINE_STATE (2026-09-13)
 * marks /r/3ss45r REDIRECT-TO-HOME with tracking stripped. Override requires
 * ORCHESTRATOR_ALLOW_REDIRECT_HOME=true AND a validated replacement URL.
 */
import fs from 'node:fs';
import path from 'node:path';

export type HealthStatus =
  | 'healthy' | 'redirect' | 'redirect_to_home' | 'rate_limited_inconclusive'
  | 'broken' | 'disabled' | 'expired' | 'unknown';

export const ELIGIBLE_HEALTH: ReadonlySet<HealthStatus> = new Set<HealthStatus>(['healthy', 'redirect']);

export type RegistryRow = {
  id: number;
  name: string;
  url: string;
  category: string | null;
  active: boolean;
  trackingStatus?: string | null;
};

export type EligibilityInput = {
  registry: RegistryRow | null;
  health: HealthStatus | null;
  contextuallyRelevant: boolean;
};

export type EligibilityResult = { eligible: boolean; reason: string };

/** Deterministic registry-level eligibility (orchestrator-side). */
export function evaluateRegistryEligibility(input: EligibilityInput): EligibilityResult {
  const { registry, health, contextuallyRelevant } = input;
  if (!registry) return { eligible: false, reason: 'no_registry_match' };
  if (!registry.active) return { eligible: false, reason: 'registry_row_inactive' };
  if (registry.trackingStatus && registry.trackingStatus !== 'real' && registry.trackingStatus !== 'unverified') {
    return { eligible: false, reason: `tracking_status_${registry.trackingStatus}` };
  }
  if (health && !ELIGIBLE_HEALTH.has(health)) return { eligible: false, reason: `health_${health}` };
  if (!contextuallyRelevant) return { eligible: false, reason: 'not_contextually_relevant' };
  return { eligible: true, reason: 'eligible' };
}

// ── Lovense SKU matcher (second tier under the brand-level registry row) ────

type LovenseEntry = {
  name: string;
  slug: string;
  match_keywords: string[];
  url: string | null;
  note?: string;
};

export type LovenseLinksFile = {
  brand: string;
  products: LovenseEntry[];
  bundles: LovenseEntry[];
  landing_pages: LovenseEntry[];
  home_page: { name: string; url: string; note?: string };
};

export type LovenseMatchTier =
  | 'product' | 'bundle' | 'landing_page' | 'home_fallback' | 'no_match' | 'ineligible_fallback';

export type LovenseMatch = {
  tier: LovenseMatchTier;
  name: string | null;
  url: string | null;
  reason: string;
};

const DEFAULT_LOVENSE_PATH = 'user_supplied/affiliates/lovense-links.json';

export function loadLovenseLinks(filePath = process.env.LOVENSE_LINKS_PATH || DEFAULT_LOVENSE_PATH): LovenseLinksFile | null {
  try {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch {
    return null; // missing file → all Lovense matching degrades to no_match (safe)
  }
}

function scoreEntry(entry: LovenseEntry, text: string): number {
  const hay = text.toLowerCase();
  let score = 0;
  for (const kw of entry.match_keywords) {
    if (hay.includes(kw.toLowerCase())) score += kw.length; // longer keyword = more specific
  }
  return score;
}

function bestMatch(entries: LovenseEntry[], text: string): { entry: LovenseEntry; score: number } | null {
  let best: { entry: LovenseEntry; score: number } | null = null;
  for (const e of entries) {
    const s = scoreEntry(e, text);
    if (s > 0 && (!best || s > best.score)) best = { entry: e, score: s };
  }
  return best;
}

export type LovenseMatchOptions = {
  allowHomeFallback?: boolean; // default false: /r/3ss45r is redirect-to-home ineligible
};

/**
 * Full Lovense matching priority:
 * exact product → bundle → landing page → fallback (ineligible by default) → no match.
 * Products with url: null never receive a guessed standalone URL — they can only
 * match via a bundle tier.
 */
export function matchLovense(text: string, file: LovenseLinksFile | null, opts: LovenseMatchOptions = {}): LovenseMatch {
  if (!file) return { tier: 'no_match', name: null, url: null, reason: 'lovense_links_file_unavailable' };

  // Tier 1: exact standalone product (url must be non-null)
  const product = bestMatch(file.products, text);
  if (product?.entry.url) {
    return { tier: 'product', name: product.entry.name, url: product.entry.url, reason: `product:${product.entry.slug}` };
  }

  // Tier 2: bundle — requires 2+ DISTINCT matched products that belong to the
  // bundle (a single product mention must never trigger a bundle URL).
  const matchedProducts = file.products.filter(p => scoreEntry(p, text) > 0);
  let bundleMatched = false;
  if (matchedProducts.length >= 2) {
    const matchedNames = matchedProducts.map(p => p.name.toLowerCase());
    const bundleCandidates = file.bundles.filter(
      b => b.url && matchedNames.filter(n => b.match_keywords.some(k => k.toLowerCase().includes(n) || n.includes(k.toLowerCase()))).length >= 2,
    );
    const bundle = bestMatch(bundleCandidates, text) ?? bundleCandidates[0] ?? null;
    if (bundle) {
      bundleMatched = true;
      return { tier: 'bundle', name: bundle.name, url: bundle.url, reason: `bundle:${bundle.slug}` };
    }
  }

  // Tier 3: landing page / topic
  const landing = bestMatch(file.landing_pages, text);
  if (landing?.entry.url) {
    return { tier: 'landing_page', name: landing.entry.name, url: landing.entry.url, reason: `landing_page:${landing.entry.slug}` };
  }

  // Tier 4: home fallback — INELIGIBLE by default (redirect-to-home, tracking stripped)
  if (opts.allowHomeFallback === true && file.home_page?.url) {
    return { tier: 'home_fallback', name: file.home_page.name, url: file.home_page.url, reason: 'home_fallback_allowed_by_config' };
  }
  if (product || bundleMatched || landing) {
    return {
      tier: 'ineligible_fallback',
      name: null,
      url: null,
      reason: 'matched_lovense_relevance_but_fallback_ineligible_redirect_to_home',
    };
  }
  return { tier: 'no_match', name: null, url: null, reason: 'no_lovense_relevance' };
}

/**
 * Full resolution: registry intent + Lovense context → final destination or internal-only.
 * Never invents a URL; never returns an ineligible destination.
 */
export function resolveEndRailAffiliate(args: {
  intentBrand: string | null;
  draftText: string;
  registryRows: RegistryRow[];
  healthByAffiliateId: Map<number, HealthStatus>;
  lovenseFile: LovenseLinksFile | null;
  isStraightNews: boolean;
  contextuallyRelevant?: boolean;
}): { mode: 'affiliate' | 'internal_only'; registryId: number | null; url: string | null; reason: string; disclosureRequired: boolean } {
  const {
    intentBrand, draftText, registryRows, healthByAffiliateId, lovenseFile,
    isStraightNews, contextuallyRelevant = true,
  } = args;

  if (isStraightNews && intentBrand == null) {
    return { mode: 'internal_only', registryId: null, url: null, reason: 'straight_news_no_forced_affiliate', disclosureRequired: false };
  }
  if (!intentBrand) return { mode: 'internal_only', registryId: null, url: null, reason: 'no_affiliate_intent', disclosureRequired: false };

  const row = registryRows.find(r => r.name.toLowerCase() === intentBrand.toLowerCase() && r.active);
  if (!row) return { mode: 'internal_only', registryId: null, url: null, reason: 'brand_not_in_registry', disclosureRequired: false };

  if (row.name.toLowerCase() === 'lovense') {
    const m = matchLovense(draftText, lovenseFile);
    if (!m.url) {
      return { mode: 'internal_only', registryId: row.id, url: null, reason: `lovense_${m.reason}`, disclosureRequired: false };
    }
    const health = healthByAffiliateId.get(row.id) ?? null;
    const elig = evaluateRegistryEligibility({ registry: row, health, contextuallyRelevant });
    if (!elig.eligible) return { mode: 'internal_only', registryId: row.id, url: null, reason: `lovense_${elig.reason}`, disclosureRequired: false };
    return { mode: 'affiliate', registryId: row.id, url: m.url, reason: `lovense_${m.reason}`, disclosureRequired: true };
  }

  const health = healthByAffiliateId.get(row.id) ?? null;
  const elig = evaluateRegistryEligibility({ registry: row, health, contextuallyRelevant });
  if (!elig.eligible) return { mode: 'internal_only', registryId: row.id, url: null, reason: elig.reason, disclosureRequired: false };
  return { mode: 'affiliate', registryId: row.id, url: row.url, reason: elig.reason, disclosureRequired: true };
}
