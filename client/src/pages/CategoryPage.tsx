import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'wouter';
import { apiRequest } from '../lib/queryClient';
import { PublicLayout, PostCard } from '../components/Layout';
import { CATEGORIES, getCategoryName, getCategoryIcon } from '../lib/api';
import { useDocumentHead } from '../lib/useDocumentHead';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/posts', slug, page],
    queryFn: () =>
      apiRequest('GET', `/api/posts?category=${slug}&page=${page}&per_page=12`).then(r => r.json()),
  });

  const posts = data?.data || [];
  const pagination = data?.meta?.pagination;
  const catName = getCategoryName(slug);

  useDocumentHead({
    title: catName ? `${catName} — PulseNSFW` : 'PulseNSFW',
    description: `Reviews, rankings, and guides for ${catName || 'NSFW'} content. Updated regularly.`,
    canonical: `/category/${slug}`,
  });
  const catIcon = getCategoryIcon(slug);

  return (
    <PublicLayout>
      <div className="section-header" style={{ marginBottom: '32px' }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
          {catIcon} {catName}
        </h1>
        <p style={{ color: 'var(--pulse-muted)', marginTop: 8 }}>
          {pagination?.total || 0} articles
        </p>
      </div>

      <div className="category-pills">
        {CATEGORIES.map(c => (
          <a key={c.slug} href={`#/category/${c.slug}`} className={`cat-pill${slug === c.slug ? ' active' : ''}`}>
            {c.icon} {c.name}
          </a>
        ))}
      </div>

      {isLoading ? (
        <div className="posts-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="post-card skeleton" style={{ minHeight: 180 }} />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><h2>No articles in this category yet</h2><p>New content coming soon.</p></div>
      ) : (
        <div className="posts-grid">
          {posts.map((post: any) => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="pagination">
          {page > 1 && <button className="pag-btn" onClick={() => setPage(p => p - 1)}>← Prev</button>}
          <span className="pag-current">{page} / {pagination.total_pages}</span>
          {page < pagination.total_pages && <button className="pag-btn" onClick={() => setPage(p => p + 1)}>Next →</button>}
        </div>
      )}
    </PublicLayout>
  );
}
