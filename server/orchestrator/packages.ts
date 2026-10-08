/**
 * packages.ts — versioned prompt-agent package registry.
 *
 * Each package: stable agent ID, semantic version, stage, system prompt,
 * input/output JSON schemas (Zod), deterministic work-packet builder, and
 * (research agents) deterministic category routing. The markdown twin of each
 * package (purpose, non-goals, fixtures) lives in prompts/<role>.md.
 *
 * Hard rules encoded here:
 * - Work packets contain NO secrets, NO raw affiliate URLs, NO credentials.
 * - Outputs are proposals/assessments only — never side effects.
 * - Agents must express refusal/uncertainty/escalation via structured fields.
 */
import { z } from 'zod';
import { CATEGORIES } from '../../shared/brand';

// ── Shared output envelope ──────────────────────────────────────────────────
const envelope = {
  status: z.enum(['ok', 'refused', 'escalate']),
  confidence: z.number().min(0).max(1),
  uncertainty: z.array(z.string()).default([]),
  escalation: z
    .object({
      reason_code: z.string(),
      detail: z.string(),
      recommended_action: z.string(),
    })
    .nullable()
    .default(null),
};

const refusalOr = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({ ...envelope, payload: payload.nullable() });

// ── Research agents (6 categories) ─────────────────────────────────────────
const newsFitSchema = z.object({
  why_users_care: z.string().min(20),
  novelty_or_timeliness: z.string().min(1),
  primary_audience: z.string().min(1),
  category_exclusivity_reason: z.string().min(1),
  source_quality: z.enum(['high', 'medium', 'low']),
  date_of_event: z.string().nullable(),
  date_of_source: z.string(),
  sensitive_content_risk: z.enum(['none', 'low', 'medium', 'high']),
  recommended_angle: z.string(),
});

const researchCandidate = z.object({
  topic: z.string().min(1),
  category: z.string(),
  finding: z.string().min(1),
  source_url: z.string(),
  source_date: z.string(),
  event_date: z.string().nullable().default(null),
  suggested_angle: z.string(),
  confidence: z.number().min(0).max(1),
  duplicate_fingerprint: z.string().min(1),
  news_fit: newsFitSchema.nullable().default(null),
});

const researchPayload = z.object({ candidates: z.array(researchCandidate) });
export type ResearchCandidate = z.infer<typeof researchCandidate>;

function researchAgent(id: string, category: string, focus: string, extraRules: string) {
  return {
    id,
    version: '1.0.0',
    stage: 'research' as const,
    category,
    systemPrompt: `You are the PulseNSFW ${id} agent. Category: ${category}.
FOCUS: ${focus}
${extraRules}
HARD RULES:
- You are stateless. You never schedule, claim, retry, publish, or mutate anything.
- You never receive or request credentials, tokens, or secrets.
- You never output raw affiliate URLs. You never invent affiliate destinations.
- Return ONLY schema-valid JSON: {status, confidence, uncertainty, escalation, payload:{candidates:[...]}}.
- Mark refused/escalate via status and escalation fields; never guess.
- Do not duplicate topics already covered (respect duplicate_fingerprint semantics).
- Do not silently switch category; if a candidate belongs elsewhere, set category and add an escalation note.`,
    inputSchema: z.object({
      category: z.string(),
      existingFingerprints: z.array(z.string()).default([]),
      charter: z.record(z.string()).default({}),
      maxCandidates: z.number().default(3),
    }),
    outputSchema: refusalOr(researchPayload),
    buildWorkPacket: (item: { category?: string | null; context?: unknown }) => ({
      category: item.category,
      existingFingerprints: ((item.context as any)?.existingFingerprints ?? []),
      charter: (item.context as any)?.charter ?? {},
      maxCandidates: 3,
    }),
    categoryRouting: (candidate: { category: string }, item: { category?: string | null }) => candidate.category,
  };
}

export const RESEARCH_AGENTS = [
  researchAgent(
    'research-ai-chatbots', 'ai-chatbots',
    'AI companions, NSFW chatbot platforms, character-AI launches, companion-app features.',
    '',
  ),
  researchAgent(
    'research-sex-tech', 'sex-tech',
    'Devices, app-controlled toys, teledildonics, sexual wellness hardware, connected intimacy.',
    '',
  ),
  researchAgent(
    'research-vr', 'vr',
    'VR/immersive adult experiences, headsets, VR platforms, spatial content.',
    '',
  ),
  researchAgent(
    'research-industry-news', 'industry-news',
    'Platform policy/access changes, creator launches & milestones, new adult platforms/sites/communities/tools, payment/access changes materially affecting users or creators.',
    `INDUSTRY NEWS CHARTER:
- Every candidate MUST include a complete news_fit record (all 9 fields).
- Reject when why_users_care cannot be credibly explained.
- Exclude: dry legal/regulatory/financial coverage without material user/creator relevance; routine filings/compliance memos/B2B announcements; unverified rumors; doxxing/private material/leaks/exploitation/NCII.
- Coverage of adult creators is limited to public, consensual, professional, verifiable developments.
- Distinguish date_of_event from date_of_source. Require real source provenance.`,
  ),
  researchAgent(
    'research-how-to', 'how-to',
    'Practical guides, tutorials, explainers, prompting techniques, setup walkthroughs.',
    '',
  ),
  researchAgent(
    'research-rankings', 'rankings',
    'Comparisons, top-N lists, versus pieces across the NSFW ecosystem.',
    '',
  ),
];

// ── Writer agents ───────────────────────────────────────────────────────────
const draftPackage = z.object({
  title: z.string().min(1),
  slug: z.string(),
  excerpt: z.string(),
  body: z.string().min(1),
  tags: z.array(z.string()).min(3).max(8),
  metaTitle: z.string(),
  metaDescription: z.string(),
  intentBrand: z.string().nullable().default(null),
  isStraightNews: z.boolean().default(false),
  newsFit: newsFitSchema.nullable().default(null),
  visualBrief: z
    .object({
      // Defaults, not requirements: paid models frequently return a brief
      // with missing subfields (assetSource etc.), and every such schema
      // failure burned a retry on an otherwise publishable draft. Missing
      // alt text falls back to orchestrator synthesis; rights status stays
      // honestly 'pending-review'.
      assetSource: z.enum(['brand-kit', 'generated', 'licensed-editorial', 'provided', 'approved-external']).default('brand-kit'),
      altText: z.string().default(''),
      caption: z.string().nullable().default(null),
      contentSafetyClassification: z.string().default('safe'),
      rightsLicensingStatus: z.string().default('pending-review'),
      generationPromptOrProvenance: z.string().nullable().default(null),
      cropOrFocalPoint: z.record(z.string()).nullable().default(null),
    })
    .nullable()
    .default(null),
  internalLinkIntents: z.array(z.string()).default([]),
  selfCheck: z.record(z.string()).default({}),
});

export const WRITER_AGENTS = [
  makeWriter('writer-ai-chatbots', 'ai-chatbots', false),
  makeWriter('writer-sex-tech', 'sex-tech', false),
  makeWriter('writer-vr', 'vr', false),
  makeWriter('writer-industry-news', 'industry-news', true),
  makeWriter('writer-how-to-rankings', 'how-to', false),
];

function makeWriter(id: string, category: string, isNews: boolean) {
  const newsRules = isNews
    ? `INDUSTRY NEWS WRITING CHARTER:
- News-oriented headline and lead; explain what happened, why it matters, who it affects, what to watch.
- Attribute sources; preserve event/source date context; separate verified facts from interpretation.
- Do NOT force a "Final Verdict" section; use "Why It Matters" / "What Happens Next" / "What to Watch".
- Hold (status=refused) drafts relying on stale reporting or unsupported claims.`
    : '';
  return {
    id,
    version: '1.0.0',
    stage: 'draft' as const,
    category,
    systemPrompt: `You are the PulseNSFW ${id} agent. Category: ${category}.
${newsRules}
HARD RULES:
- You produce a structured draft PROPOSAL only. You never create posts, set status, mark research used, publish, or mutate state.
- You never receive credentials; you never output raw affiliate URLs; affiliate intent is expressed as intentBrand only.
- Internal links must use /posts/[slug] form only.
- visualBrief.altText MUST be a descriptive sentence of at least 10 characters describing the editorial image (never empty).
- The body MUST contain at least 2 internal links written as markdown anchor tags with href="/posts/your-slug-here" (kebab-case slugs for other PulseNSFW articles on related topics; invent plausible slugs when needed).
- Return ONLY schema-valid JSON: {status, confidence, uncertainty, escalation, payload:{draft package}}.
- payload MUST be the draft package with EXACTLY these required keys: "title" (headline), "slug" (kebab-case), "excerpt" (<=200 chars), "body" (full article draft, markdown, 600-1200 words), "tags" (3-8 strings), "metaTitle" (<=60 chars), "metaDescription" (<=155 chars). Optional keys: intentBrand, isStraightNews, newsFit, visualBrief, internalLinkIntents, selfCheck. Do NOT invent other fields or wrap the package in extra objects.
- If source material is insufficient, return status=refused with escalation details.
- The research material is a SEED, not a full source: expand it with your general knowledge of the category to reach the required word count and depth. Refuse ONLY for genuine policy or safety conflicts (e.g. sensitive_content_risk high, defamatory or private material, contradicted facts) — NEVER merely because the seed text is short or thin.`,
    inputSchema: z.object({
      researchItem: z.record(z.string()),
      contentPolicy: z.record(z.string()).default({}),
      charter: z.record(z.string()).default({}),
    }),
    outputSchema: refusalOr(draftPackage),
    buildWorkPacket: (item: { sourcePayload?: unknown; context?: unknown }) => ({
      researchItem: item.sourcePayload ?? {},
      contentPolicy: (item.context as any)?.contentPolicy ?? {},
      charter: (item.context as any)?.charter ?? {},
    }),
  };
}

// ── Affiliate injector ──────────────────────────────────────────────────────
export const AFFILIATE_INJECTOR = {
  id: 'affiliate-injector',
  version: '1.0.0',
  stage: 'end_rail' as const,
  systemPrompt: `You are the PulseNSFW affiliate-injector agent. You PROPOSE end-rail intent only.
HARD RULES:
- You never output raw affiliate URLs; you never modify affiliate records; you never inject links into content.
- Registry metadata you receive contains brand names/categories/keywords only — never URLs.
- Return internal_only intent when no genuine contextual match exists.
- Potential NEW programs become escalation records, never links.
- Return ONLY schema-valid JSON.`,
  inputSchema: z.object({
    draftContext: z.record(z.string()),
    allowedRegistryMetadata: z.array(z.record(z.string())).default([]),
    endRailPolicy: z.record(z.string()).default({}),
  }),
  outputSchema: refusalOr(
    z.object({
      relatedPostIds: z.array(z.number()).default([]),
      relatedPostSlugs: z.array(z.string()).default([]),
      affiliateIntent: z
        .object({
          brand: z.string().nullable(),
          contextuallyRelevant: z.boolean(),
          rationale: z.string(),
        })
        .nullable()
        .default(null),
      isStraightNews: z.boolean().default(false),
      draftContextText: z.string().default(''),
    }),
  ),
  buildWorkPacket: (item: { sourcePayload?: unknown; context?: unknown }) => ({
    draftContext: item.sourcePayload ?? {},
    allowedRegistryMetadata: (item.context as any)?.allowedRegistryMetadata ?? [],
    endRailPolicy: (item.context as any)?.endRailPolicy ?? {},
  }),
};

// ── QC publisher ────────────────────────────────────────────────────────────
export const QC_PUBLISHER = {
  id: 'qc-publisher',
  version: '1.1.0',
  stage: 'qc' as const,
  systemPrompt: `You are the PulseNSFW qc-publisher agent. You return one structured RECOMMENDATION (publish|hold|reject) with a full scorecard and exact remediation for every hold/reject.
MANDATE: You check POLICY COMPLIANCE, not external fact-verification. This pipeline has no web access: drafts are written from supplied research material plus general category knowledge. You cannot and must not hold a draft merely because its product claims cannot be independently verified — attribute language ("reportedly", "according to") is sufficient.
- Recommend publish when: category fit, brand policy, metadata, word count, internal links, visual readiness, end-rail validity, affiliate eligibility & disclosure, no raw/untracked affiliate URLs, and content-safety are all satisfied.
- Hold ONLY for concrete policy violations (safety risk, brand-positioning breach, missing metadata/links, raw affiliate URLs, category mismatch). NEVER hold solely for unverifiable product specifics or missing citations. If remediation is empty, the recommendation MUST be publish.
- You never perform publishing; you never call APIs; you never mutate anything.
- You never receive credentials or raw affiliate URLs; you assess eligibility labels supplied by the orchestrator.
- Return ONLY schema-valid JSON.`,
  inputSchema: z.object({
    draft: z.record(z.string()),
    gates: z.array(z.record(z.string())).default([]),
    endRail: z.record(z.string()).default({}),
    media: z.record(z.string()).default({}),
    categoryPolicies: z.record(z.string()).default({}),
  }),
  outputSchema: refusalOr(
    z.object({
      recommendation: z.enum(['publish', 'hold', 'reject']),
      // Scorecard/remediation are ADVISORY (stored in escalation detail);
      // only `recommendation` gates publishing. Models routinely return the
      // scorecard as an object or remediation as objects — coerce instead of
      // burning retries on schema_invalid for data nobody branches on.
      scorecard: z.preprocess((v: any) => {
        const toEntry = (check: unknown, e: unknown) => {
          if (e && typeof e === 'object') {
            const o = e as Record<string, unknown>;
            return {
              check: String(o.check ?? check ?? 'check'),
              severity: (['info', 'minor', 'major', 'critical'].includes(String(o.severity)) ? o.severity : 'info'),
              pass: Boolean(o.pass ?? true),
              detail: String(o.detail ?? ''),
            };
          }
          return { check: String(check ?? 'check'), severity: 'info' as const, pass: true, detail: String(e ?? '') };
        };
        if (Array.isArray(v)) return v.map((e: any, i: number) => toEntry(e?.check ?? `item-${i}`, e));
        if (v && typeof v === 'object') return Object.entries(v).map(([check, e]) => toEntry(check, e));
        return [];
      }, z.array(z.object({
        check: z.string(),
        severity: z.enum(['info', 'minor', 'major', 'critical']),
        pass: z.boolean(),
        detail: z.string(),
      }))),
      remediation: z.preprocess((v: any) => {
        if (Array.isArray(v)) return v.map((e: any) => (typeof e === 'string' ? e : String((e as any)?.detail ?? (e as any)?.message ?? JSON.stringify(e))));
        if (typeof v === 'string') return [v];
        return [];
      }, z.array(z.string()).default([])),
    }),
  ),
  buildWorkPacket: (item: { sourcePayload?: unknown; context?: unknown }) => ({
    draft: item.sourcePayload ?? {},
    gates: (item.context as any)?.gates ?? [],
    endRail: (item.context as any)?.endRail ?? {},
    media: (item.context as any)?.media ?? {},
    categoryPolicies: (item.context as any)?.categoryPolicies ?? {},
  }),
};

// ── Affiliate health checker ────────────────────────────────────────────────
export const AFFILIATE_HEALTH_CHECKER = {
  id: 'affiliate-health-checker',
  version: '1.0.0',
  stage: 'health_check' as const,
  systemPrompt: `You are the PulseNSFW affiliate-health-checker agent. You are READ-ONLY: you observe URL health and return structured observations.
HARD RULES:
- You never change affiliate records or content; you never send communications.
- Respect rate limits: observations of HTTP 429 are rate_limited_inconclusive, NEVER "dead".
- Distinguish healthy, redirect, redirect_to_home, rate_limited_inconclusive, broken, disabled, expired, unknown.
- Redirect-to-home / tracking-loss must be reported as redirect_to_home.
- Return ONLY schema-valid JSON.`,
  inputSchema: z.object({
    targets: z.array(z.record(z.string())).default([]),
    rateLimitPolicy: z.record(z.string()).default({}),
  }),
  outputSchema: refusalOr(
    z.object({
      observations: z.array(
        z.object({
          url: z.string(),
          affiliateId: z.number().nullable().default(null),
          status: z.enum(['healthy', 'redirect', 'redirect_to_home', 'rate_limited_inconclusive', 'broken', 'disabled', 'expired', 'unknown']),
          httpStatus: z.number().nullable().default(null),
          redirectTarget: z.string().nullable().default(null),
          notes: z.string().nullable().default(null),
        }),
      ),
    }),
  ),
  buildWorkPacket: (item: { context?: unknown }) => ({
    targets: (item.context as any)?.targets ?? [],
    rateLimitPolicy: (item.context as any)?.rateLimitPolicy ?? {},
  }),
};

// ── Persona auditor (report-only) ───────────────────────────────────────────
export const PERSONA_AUDITOR = {
  id: 'persona-auditor',
  version: '1.0.0',
  stage: 'audit' as const,
  systemPrompt: `You are the PulseNSFW persona-auditor agent. REPORT-ONLY during calibration.
HARD RULES:
- You never mutate articles or publishing state; you never send communications.
- You produce category/persona scorecards with actionable findings.
- You are non-blocking until Brent approves calibration thresholds.
- Return ONLY schema-valid JSON.`,
  inputSchema: z.object({
    persona: z.string(),
    auditTargets: z.array(z.record(z.string())).default([]),
    rubric: z.record(z.string()).default({}),
  }),
  outputSchema: refusalOr(
    z.object({
      persona: z.string(),
      scores: z.record(z.number()),
      findings: z.array(z.string()),
      finalScore: z.number(),
    }),
  ),
  buildWorkPacket: (item: { context?: unknown }) => ({
    persona: (item.context as any)?.persona ?? 'site-wide',
    auditTargets: (item.context as any)?.auditTargets ?? [],
    rubric: (item.context as any)?.rubric ?? {},
  }),
};

// ── Visual director (optional distinct visual brief agent) ──────────────────
export const VISUAL_DIRECTOR = {
  id: 'visual-director',
  version: '1.0.0',
  stage: 'visual' as const,
  systemPrompt: `You are the PulseNSFW visual-director agent. You produce a structured visual BRIEF (proposal only) per draft.
HARD RULES:
- You never generate, upload, or attach media; the orchestrator owns all media side effects.
- Briefs must include asset_source, alt text, safety classification, and rights/licensing status.
- No generic-stock, misleading, irrelevant, or unsafe visual patterns.
- Return ONLY schema-valid JSON.`,
  inputSchema: z.object({ draftContext: z.record(z.string()), brandKit: z.record(z.string()).default({}) }),
  outputSchema: refusalOr(
    z.object({
      assetSource: z.enum(['brand-kit', 'generated', 'licensed-editorial', 'provided', 'approved-external']),
      altText: z.string().min(10),
      caption: z.string().nullable().default(null),
      attribution: z.string().nullable().default(null),
      contentSafetyClassification: z.string(),
      rightsLicensingStatus: z.string(),
      generationPromptOrProvenance: z.string().nullable().default(null),
      cropOrFocalPoint: z.record(z.string()).nullable().default(null),
      status: z.enum(['proposed', 'approved', 'rejected', 'ready']),
    }),
  ),
  buildWorkPacket: (item: { sourcePayload?: unknown; context?: unknown }) => ({
    draftContext: item.sourcePayload ?? {},
    brandKit: (item.context as any)?.brandKit ?? {},
  }),
};

// ── Registry ────────────────────────────────────────────────────────────────
export type AgentPackage = {
  id: string;
  version: string;
  stage: 'research' | 'draft' | 'end_rail' | 'qc' | 'health_check' | 'audit' | 'visual';
  systemPrompt: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  buildWorkPacket: (item: any) => unknown;
  categoryRouting?: (candidate: { category: string }, item: { category?: string | null }) => string;
  category?: string;
};

export const AGENTS: AgentPackage[] = [
  ...RESEARCH_AGENTS,
  ...WRITER_AGENTS,
  AFFILIATE_INJECTOR, QC_PUBLISHER, AFFILIATE_HEALTH_CHECKER, PERSONA_AUDITOR, VISUAL_DIRECTOR,
];

export function getAgent(role: string): AgentPackage | undefined {
  return AGENTS.find(a => a.id === role);
}

export const AGENT_IDS = AGENTS.map(a => a.id);
