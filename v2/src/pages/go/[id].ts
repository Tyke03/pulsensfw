import type { APIRoute } from 'astro';
import { getContentRepository } from '../../lib/content/local-repository';
import {
  isValidLinkId,
  loadRegistryLinksFromSupabase,
  recordAffiliateClick,
  resolveAffiliateLink,
} from '../../lib/affiliates/registry';

/**
 * Site-wide affiliate redirect engine (/go/<link-id>).
 *
 * - Resolves against Supabase `affiliate_links` with automatic fallback on
 *   paused/dead links, then catalog entity records.
 * - Logs click attribution (link_id, article_slug, slot) to Supabase with
 *   zero PII (no IP addresses, no user IDs).
 * - Responds with 302 Found and `noindex, nofollow`.
 */
export const GET: APIRoute = async ({ params, url }) => {
  const linkId = (params.id ?? '').trim();
  if (!linkId || !isValidLinkId(linkId)) {
    return new Response('Unknown redirect link.', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  const repo = getContentRepository();
  const [catalog, registryLinks] = await Promise.all([
    repo.listCatalog(),
    loadRegistryLinksFromSupabase(),
  ]);

  const resolved = resolveAffiliateLink(linkId, catalog, registryLinks);
  if (!resolved) {
    return new Response('Redirect target not found.', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
    });
  }

  const articleSlug = url.searchParams.get('src');
  const slot = url.searchParams.get('slot');

  await recordAffiliateClick({
    linkId: resolved.resolvedLinkId,
    articleSlug,
    slot,
    resolvedStatus: resolved.resolution,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: resolved.url,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
};
