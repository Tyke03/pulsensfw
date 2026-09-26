/**
 * shared/brand.ts — centralized brand copy, categories, and editorial policy.
 * Single source of truth for public wording. Brent approves final copy here.
 * The retired review-only positioning ("Honestly Reviewed." / "Unbiased …")
 * must not appear anywhere else; tests enforce this.
 */

export const BRAND = {
  name: 'PulseNSFW',
  domain: 'pulsensfw.com',
  tagline: "What's New in the NSFW Internet.",
  descriptor:
    'News, discoveries, guides, reviews, rankings, and honest coverage across AI companions, sex tech, VR, adult creators, and the wider NSFW web.',
  /** URL rules — two distinct, non-interchangeable patterns (regression-tested). */
  urls: {
    /** Generated editorial internal links */
    post: (slug: string) => `/posts/${slug}`,
    /** Live browser audit route (hash-router SPA) */
    auditPost: (slug: string) => `https://pulsensfw.com/#/post/${slug}`,
  },
};

export const RETIRED_POSITIONING = [
  'The NSFW Internet, Honestly Reviewed.',
  'Unbiased reviews, rankings, and guides',
] as const;

export const CATEGORIES = ['ai-chatbots', 'sex-tech', 'vr', 'industry-news', 'how-to', 'rankings'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Deterministic category-routing policy (orchestrator-enforced; research agents must comply). */
export const ROUTING_POLICY: Record<Category, { owns: string[]; escalates: string[] }> = {
  'ai-chatbots': {
    owns: ['ai companion', 'ai chatbot', 'character ai', 'companion app', 'chatbot launch', 'llm companion'],
    escalates: [],
  },
  'sex-tech': {
    owns: ['sex toy', 'device', 'teledildonics', 'app-controlled', 'haptic toy', 'wellness device', 'hardware'],
    escalates: [],
  },
  vr: {
    owns: ['vr headset', 'immersive', 'vr platform', 'virtual reality', 'spatial'],
    escalates: [],
  },
  'industry-news': {
    owns: [
      'creator economy', 'platform policy', 'payment processor', 'adult platform', 'launch of a platform',
      'creator milestone', 'site launch', 'community news', 'access change', 'platform trend',
    ],
    escalates: ['legal', 'regulation', 'filing', 'b2b', 'earnings report', 'compliance memo'],
  },
  'how-to': {
    owns: ['how to', 'guide', 'tutorial', 'explainer', 'prompting', 'setup'],
    escalates: [],
  },
  rankings: {
    owns: ['best', 'top', 'ranked', 'comparison', 'versus', 'vs'],
    escalates: [],
  },
};

/** Editorial word-count policy by category (QC deterministic gate). */
export const WORD_COUNT_POLICY: Record<Category, { min: number; max: number }> = {
  'ai-chatbots': { min: 800, max: 1600 },
  'sex-tech': { min: 800, max: 1600 },
  vr: { min: 800, max: 1600 },
  'industry-news': { min: 600, max: 1400 },
  'how-to': { min: 800, max: 1800 },
  rankings: { min: 1200, max: 2200 },
};

/** Industry News charter (excerpts; full charter lives with the research/writer packages). */
export const INDUSTRY_NEWS_CHARTER = {
  definition:
    'Industry News covers newly relevant, user-interesting developments in the wider NSFW ecosystem that are not more appropriately assigned to AI Chatbots, Sex Tech, VR, How-To, or Rankings.',
  excludes: [
    'legal, regulatory, financial, or policy coverage without clear material user/creator relevance',
    'routine corporate filings, legal documents, compliance memoranda, or B2B announcements',
    'dry trade-industry coverage whose only relevance is that it involves an adult company',
    'content more properly categorized under AI Chatbots, Sex Tech, VR, How-To, or Rankings',
    'unverified rumors',
    'doxxing, private material, leaks, exploitation, nonconsensual content, or harassment-oriented reporting',
  ],
  newsFitRequiredFields: [
    'why_users_care', 'novelty_or_timeliness', 'primary_audience', 'category_exclusivity_reason',
    'source_quality', 'date_of_event', 'date_of_source', 'sensitive_content_risk', 'recommended_angle',
  ] as const,
  closingSectionOptions: ['Why It Matters', 'What Happens Next', 'What to Watch'],
};

/** Article-end-rail policy constants. */
export const END_RAIL_POLICY = {
  relatedCountMin: 1,
  relatedCountMax: 3,
  affiliateCtaCountMax: 1,
  disclosureText:
    'Affiliate link—if you choose to try it, PulseNSFW may earn a commission at no extra cost to you.',
  straightNewsNoAffiliate: true,
};
