/**
 * Reusable N:1 research claim pool with volatility-based TTLs.
 *
 * Researchers deposit discrete, sourced claims across runs; writers cherry-pick
 * fresh snippets from multiple briefs/entities to assemble richly cited articles.
 * Volatile categories (pricing, active community sentiment, features) expire
 * much faster than static facts.
 */
export const CLAIM_CATEGORIES = ['pricing', 'community', 'features', 'policy', 'static'] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CLAIM_TTL_DAYS: Record<ClaimCategory, number> = {
  pricing: 14,
  community: 21,
  features: 45,
  policy: 60,
  static: 180,
};

export type ClaimEvidenceType = 'first_party' | 'community' | 'hands_on' | 'press' | 'aggregator';

export type ResearchClaim = {
  claim_id: string;
  desk: string;
  entity_slug: string | null;
  category: ClaimCategory;
  claim_key: string;
  claim_value: string;
  source_url: string;
  evidence_type: ClaimEvidenceType;
  tags: string[];
  checked_at: string;
  expires_at: string;
  notes?: string;
};

export type CreateClaimInput = {
  claim_id: string;
  desk: string;
  entity_slug?: string | null;
  category: ClaimCategory;
  claim_key: string;
  claim_value: string;
  source_url: string;
  evidence_type: ClaimEvidenceType;
  tags?: string[];
  checked_at?: Date | string;
  ttl_days?: number;
  notes?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createResearchClaim(input: CreateClaimInput): ResearchClaim {
  const checkedDate = input.checked_at ? new Date(input.checked_at) : new Date();
  const ttlDays = input.ttl_days ?? CLAIM_TTL_DAYS[input.category];
  const expiresDate = new Date(checkedDate.getTime() + Math.max(1, ttlDays) * DAY_MS);
  return {
    claim_id: input.claim_id,
    desk: input.desk,
    entity_slug: input.entity_slug ?? null,
    category: input.category,
    claim_key: input.claim_key,
    claim_value: input.claim_value,
    source_url: input.source_url,
    evidence_type: input.evidence_type,
    tags: input.tags ?? [],
    checked_at: checkedDate.toISOString(),
    expires_at: expiresDate.toISOString(),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

export function isClaimFresh(claim: Pick<ResearchClaim, 'expires_at'>, now: Date = new Date()): boolean {
  return new Date(claim.expires_at).getTime() > now.getTime();
}

export function partitionClaims(
  claims: ResearchClaim[],
  now: Date = new Date(),
): { fresh: ResearchClaim[]; stale: ResearchClaim[] } {
  const fresh: ResearchClaim[] = [];
  const stale: ResearchClaim[] = [];
  for (const claim of claims) {
    if (isClaimFresh(claim, now)) fresh.push(claim);
    else stale.push(claim);
  }
  return { fresh, stale };
}

export function queryFreshClaims(
  claims: ResearchClaim[],
  filter: {
    desk?: string;
    entitySlug?: string;
    category?: ClaimCategory;
    tag?: string;
    excludeAggregator?: boolean;
  } = {},
  now: Date = new Date(),
): ResearchClaim[] {
  const tagNeedle = filter.tag?.trim().toLowerCase();
  return claims
    .filter((claim) => isClaimFresh(claim, now))
    .filter((claim) => (!filter.desk || claim.desk === filter.desk))
    .filter((claim) => (!filter.entitySlug || claim.entity_slug === filter.entitySlug))
    .filter((claim) => (!filter.category || claim.category === filter.category))
    .filter((claim) => (!filter.excludeAggregator || claim.evidence_type !== 'aggregator'))
    .filter((claim) => (!tagNeedle || claim.tags.some((t) => t.toLowerCase() === tagNeedle)))
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at) || a.claim_id.localeCompare(b.claim_id));
}

/** Drop expired claims once they have aged past the optional grace window. */
export function pruneExpiredClaims(
  claims: ResearchClaim[],
  now: Date = new Date(),
  graceDays = 7,
): ResearchClaim[] {
  const cutoff = now.getTime() - Math.max(0, graceDays) * DAY_MS;
  return claims.filter((claim) => new Date(claim.expires_at).getTime() >= cutoff);
}
