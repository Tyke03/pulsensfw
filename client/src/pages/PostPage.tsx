import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { marked } from 'marked';
import { apiRequest } from '../lib/queryClient';
import { PublicLayout, PostCard } from '../components/Layout';
import { getCategoryName, formatDate } from '../lib/api';

function renderBody(body: string): string {
  if (!body) return '';
  // If body contains HTML tags, use as-is; otherwise parse as markdown
  if (body.trimStart().startsWith('<')) return body;
  // Unescape literal \n sequences stored from seeder
  const normalized = body.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  return marked.parse(normalized, { async: false }) as string;
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

  const { data: affiliatesData } = useQuery({
    queryKey: ['/api/affiliates', postData?.data?.category],
    queryFn: () => apiRequest('GET', `/api/affiliates?category=${postData?.data?.category}`).then(r => r.json()),
    enabled: !!postData?.data?.category,
  });

  const post = postData?.data;
  const related = relatedData?.data || [];
  const affiliates = affiliatesData?.data || [];

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

  const affiliateLinks = Array.isArray(post.affiliate_links) ? post.affiliate_links : [];
  const inlineAffiliates = [...affiliateLinks, ...affiliates.slice(0, 3 - affiliateLinks.length)];

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
                <span className="affiliate-link-name">{link.name || link.url}</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" className="affiliate-link-btn">
                  Visit →
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="article-body" dangerouslySetInnerHTML={{ __html: renderBody(post.body || '') }} />

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
