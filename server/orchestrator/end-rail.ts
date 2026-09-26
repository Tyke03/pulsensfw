/**
 * end-rail.ts — article-end discovery & affiliate pathway logic.
 * Pure selection/validation functions (used by the API route, the renderer,
 * and tests). The orchestrator persists the validated plan; the API serves it.
 */
import { END_RAIL_POLICY } from '../../shared/brand';

export type RelatedCandidate = {
  id: number;
  slug: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  publishedAt: Date | null;
};

export type EndRailPlan = {
  relatedPostIds: number[];
  relatedPostSlugs: string[];
  affiliateRegistryId: number | null;
  affiliateResolutionReason: string | null;
  fallbackMode: 'affiliate' | 'internal_only';
  disclosureText: string | null;
  validationStatus: 'pending' | 'valid' | 'invalid';
};

/**
 * Select up to 3 genuinely related published posts. Never selects the current
 * post, drafts, held, or unpublished items (candidates must be pre-filtered to
 * published; this function additionally guards). Scores by category match,
 * tag overlap, and recency. If fewer valid candidates exist than preferred,
 * returns the valid set (never invents links).
 */
export function selectRelatedPosts(args: {
  currentSlug: string;
  currentCategory: string | null;
  candidates: RelatedCandidate[]; // MUST come from a published-only query
}): { selected: RelatedCandidate[]; droppedCurrentPost: boolean; droppedUnpublished: boolean } {
  const { currentSlug, currentCategory, candidates } = args;
  let droppedCurrentPost = false;
  let droppedUnpublished = false;

  const eligible = candidates.filter(c => {
    if (c.slug === currentSlug) {
      droppedCurrentPost = true;
      return false;
    }
    // Defensive: anything without a publishedAt timestamp is not published.
    if (!c.publishedAt) {
      droppedUnpublished = true;
      return false;
    }
    return true;
  });

  const scored = eligible.map(c => {
    let score = 0;
    if (currentCategory && c.category === currentCategory) score += 3;
    score += Math.min(c.tags?.length ?? 0, 5) * 0.5; // tag overlap proxy handled by caller query when possible
    const ageDays = (Date.now() - new Date(c.publishedAt!).getTime()) / 86_400_000;
    score += Math.max(0, 2 - ageDays / 30); // recency bonus, decays over ~2 months
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    selected: scored.slice(0, END_RAIL_POLICY.relatedCountMax).map(s => s.c),
    droppedCurrentPost,
    droppedUnpublished,
  };
}

/** Render-time validation: every link must target a published, reachable slug. */
export function validateRelatedLinks(slugs: string[], publishedSlugs: Set<string>): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const s of slugs) (publishedSlugs.has(s) ? valid : invalid).push(s);
  return { valid, invalid };
}

/** Full plan validation used by the orchestrator gate and the API. */
export function validateEndRailPlan(plan: EndRailPlan, publishedSlugs: Set<string>): { valid: boolean; detail: string } {
  const { valid } = validateRelatedLinks(plan.relatedPostSlugs ?? [], publishedSlugs);
  if (valid.length < END_RAIL_POLICY.relatedCountMin) {
    return { valid: false, detail: `insufficient valid related posts (${valid.length})` };
  }
  if (plan.fallbackMode === 'affiliate') {
    if (!plan.affiliateRegistryId) return { valid: false, detail: 'affiliate mode without registry id' };
    if (!plan.disclosureText) return { valid: false, detail: 'affiliate mode without disclosure' };
  }
  return { valid: true, detail: `mode=${plan.fallbackMode}, related=${valid.length}` };
}
