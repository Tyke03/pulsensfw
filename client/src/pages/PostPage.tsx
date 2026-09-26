import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { marked } from 'marked';
import { apiRequest } from '../lib/queryClient';
import { PublicLayout, PostCard } from '../components/Layout';
import ArticleEndRail from '../components/ArticleEndRail';
import { getCategoryName, formatDate } from '../lib/api';
import { useDocumentHead } from '../lib/useDocumentHead';

function renderBody(body: string): string {
  if (!body) return '';
  let html: string;
  // If body contains HTML tags, use as-is; otherwise parse as markdown
  if (body.trimStart().startsWith('<')) {
    html = body;
  } else {
    // Unescape literal \n sequences stored from seeder
    const normalized = body.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    html = marked.parse(normalized, { async: false }) as string;
  }
  // Some article bodies were written with the legacy /posts/[slug] path format. The site is a
  // hash-router SPA (routes live at /#/post/[slug], singular), so a bare /posts/[slug] anchor is
  // a full-page navigation to a URL the server does not serve, producing a blank/404 page.
  // Rewrite any such link at render time so old and new content both resolve correctly.
  html = html.replace(/href=(["'])\/posts\//g, 'href=$1#/post/');
  return html;
}

export default function PostPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: postData, isLoading } = useQuery({
    queryKey: ['/api/posts', slug],
    queryFn: () => apiRequest('GET', `/api/posts/${slug}`).then(r => r.json()),
  });

  const { data: relatedData } = useQuery({
    queryKey: ['/api/related', slug],
    queryFn: () => apiRequest('GET', `/api/related/${slug}`).then(r => r.json()),
    enabled: !!slug,
  });

  const { data: endRailData } = useQuery({
    queryKey: ['/api/end-rail', slug],
    queryFn: () => apiRequest('GET', `/api/end-rail/${slug}`).then(r => r.json()),
    enabled: !!slug,
  });

  const { data: affiliatesData } = useQuery({
    queryKey: ['/api/affiliates', postData?.data?.category],
    queryFn: () => apiRequest('GET', `/api/affiliates?category=${postData?.data?.category}`).then(r => r.json()),
    enabled: !!postData?.data?.category,
  });

  const post = postData?.data;
  const related = relatedData?.data || [];
  const affiliates = affiliatesData?.data || [];

  // Dynamic SEO head — writes <title> and <meta description> per article
  useDocumentHead({
    title:       post?.metaTitle       || post?.meta_title       || post?.title,
    description: post?.metaDescription || post?.meta_description || post?.excerpt,
    canonical:   post?.slug ? `/posts/${post.slug}` : undefined,
  });

  if (isLoading) return (
    <PublicLayout>
      <div style={{ maxWidth: 740, margin: '40px auto' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: i === 0 ? 48 : 18, marginBottom: 16, borderRadius: 6 }} />
        ))}
      </div>
    </PublicLayout>
  );

  if (!post) return (
    <PublicLayout>
      <div className="empty-state"><h2>Article not found</h2><p>It may have been removed or the URL is incorrect.</p></div>
    </PublicLayout>
  );

  // API returns camelCase affiliateLinks (Drizzle maps the affiliate_links DB column to this
  // JS field name). Read that first; snake_case is kept only as a defensive fallback in case an
  // older payload shape is ever served.
  const rawAffiliateLinks = post.affiliateLinks ?? post.affiliate_links;
  const affiliateLinksRaw = Array.isArray(rawAffiliateLinks) ? rawAffiliateLinks : [];
  // Pipeline writers have submitted affiliateLinks as either name/url objects or bare URL
  // strings. Normalize both shapes here so a bare-string entry never renders an empty name/link
  // (audit item 4: affiliate-link-name span with no text).
  const affiliateLinks = affiliateLinksRaw
    .map((link: any) => {
      if (typeof link === 'string') return { name: link, url: link };
      if (link && typeof link === 'object' && link.url) return { name: link.name || link.url, url: link.url };
      return null;
    })
    .filter(Boolean);
  // Only fall back to the generic per-category affiliate list when the article has NO usable
  // links of its own — never pad a real, curated set with unrelated category-wide filler.
  const inlineAffiliates = affiliateLinks.length > 0 ? affiliateLinks : affiliates.slice(0, 3);

  return (
    <PublicLayout>
      <article>
        <div className="article-header">
          <Link href={`/category/${post.category}`}>
            <a className="cat-label" style={{ color: 'var(--pulse-red)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem', fontWeight: 500 }}>
              {getCategoryName(post.category)}
            </a>
          </Link>
          <h1 className="article-title">{post.title}</h1>
          <div className="article-meta">
            {formatDate(post.publishedAt || post.createdAt || post.published_at || post.created_at)}
          </div>
          {(post.tags || []).length > 0 && (
            <div className="article-tags">
              {post.tags.map((t: string) => (
                <Link key={t} href={`/?tag=${t}`}><a>#{t}</a></Link>
              ))}
            </div>
          )}
        </div>

        {inlineAffiliates.length > 0 && (
          <div className="affiliate-box">
            <h3>🔗 Quick Links</h3>
            {inlineAffiliates.map((link: any, i: number) => (
              <div key={i} className="affiliate-link">
                <span className="affiliate-link-name">{String(link.name || link.url || '').replace(/\s*\(owned property\)\s*$/i, '')}</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" className="affiliate-link-btn">
                  Visit →
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="article-body" dangerouslySetInnerHTML={{ __html: renderBody(post.body || '') }} />

        {endRailData?.data?.relatedPosts?.length > 0 && (
          <ArticleEndRail plan={{
            relatedPosts: endRailData.data.relatedPosts,
            affiliate: endRailData.data.affiliate ?? null,
            fallbackMode: endRailData.data.fallbackMode ?? 'internal_only',
            disclosureText: endRailData.data.disclosureText ?? null,
          }} />
        )}

        {related.length > 0 && (
          <section className="related-section">
            <h2>Related Articles</h2>
            <div className="posts-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {related.map((p: any) => <PostCard key={p.id} post={p} />)}
            </div>
          </section>
        )}
      </article>
    </PublicLayout>
  );
}
