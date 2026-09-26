/**
 * ArticleEndRail.tsx — reusable article-end discovery & affiliate pathway.
 *
 * Contract (enforced by tests):
 * - Always renders the internal "Keep Exploring" path when given ≥1 valid
 *   related post (slugs validated by the caller against published posts).
 * - Renders AT MOST ONE external affiliate CTA, only when plan.fallbackMode
 *   is 'affiliate' (meaning the orchestrator resolved an eligible, healthy,
 *   canonical-registry destination). Includes visible disclosure.
 * - Internal editorial CTA fallback when no eligible affiliate exists.
 * - All internal links use /posts/[slug]; the audit URL rule is separate and
 *   never rendered here.
 * - Editorial body never contains affiliate markup; this component owns it.
 */
import { BRAND } from '@shared/brand';

export type EndRailPlanView = {
  relatedPosts: Array<{ slug: string; title: string }>;
  affiliate: { name: string; url: string; description: string | null } | null;
  fallbackMode: 'affiliate' | 'internal_only';
  disclosureText: string | null;
};

export function ArticleEndRail({ plan }: { plan: EndRailPlanView }) {
  const { relatedPosts, affiliate, fallbackMode, disclosureText } = plan;
  if (!relatedPosts || relatedPosts.length === 0) return null; // publish gate prevents this state

  return (
    <aside className="article-end-rail" data-testid="article-end-rail">
      <h3>Keep Exploring</h3>
      <ul className="end-rail-related">
        {relatedPosts.map(p => (
          <li key={p.slug}>
            <a href={BRAND.urls.post(p.slug)}>{p.title}</a>
          </li>
        ))}
      </ul>

      {fallbackMode === 'affiliate' && affiliate ? (
        <div className="end-rail-affiliate" data-testid="end-rail-affiliate">
          <a href={affiliate.url} rel="sponsored noopener" target="_blank">
            {affiliate.name}
          </a>
          {affiliate.description ? <p className="end-rail-affiliate-desc">{affiliate.description}</p> : null}
          {disclosureText ? (
            <p className="affiliate-disclosure" data-testid="affiliate-disclosure">
              {disclosureText}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="end-rail-internal-cta" data-testid="end-rail-internal-cta">
          <a href={BRAND.urls.post(relatedPosts[0].slug)}>
            Keep reading: {relatedPosts[0].title}
          </a>
        </div>
      )}
    </aside>
  );
}

export default ArticleEndRail;
