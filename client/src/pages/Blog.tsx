import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'wouter';
import { apiRequest } from '../lib/queryClient';
import { PublicLayout, PostCard } from '../components/Layout';
import { CATEGORIES } from '../lib/api';
import { useDocumentHead } from '../lib/useDocumentHead';

export default function Blog() {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/posts', category, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '12' });
      if (category) params.set('category', category);
      return apiRequest('GET', `/api/posts?${params}`).then(r => r.json());
    },
  });

  const posts = data?.data || [];
  const pagination = data?.meta?.pagination;

  useDocumentHead({
    title: 'PulseNSFW — The NSFW Internet, Honestly Reviewed.',
    description: 'Unbiased reviews, rankings, and guides for NSFW AI chatbots, sex tech, VR porn, and the adult creator economy.',
    canonical: '/',
  });

  return (
    <PublicLayout>
      <section className="hero-section">
        <h1 className="hero-title">The NSFW Internet,<br /><span style={{ color: 'var(--pulse-red)' }}>Honestly Reviewed.</span></h1>
        <p className="hero-sub">Unbiased reviews, rankings, and guides for AI chatbots, sex tech, VR, and everything in between.</p>
      </section>

      <div className="category-pills">
        <button className={`cat-pill${!category ? ' active' : ''}`} onClick={() => { setCategory(''); setPage(1); }} data-testid="cat-all">All</button>
        {CATEGORIES.map(c => (
          <button key={c.slug} className={`cat-pill${category === c.slug ? ' active' : ''}`} onClick={() => { setCategory(c.slug); setPage(1); }} data-testid={`cat-${c.slug}`}>
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="posts-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="post-card skeleton" style={{ minHeight: 200 }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><h2>No articles yet</h2><p>Check back soon.</p></div>
      ) : (
        <div className="posts-grid">
          {posts.map((post: any) => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="pagination">
          {page > 1 && <button className="pag-btn" onClick={() => setPage(p => p - 1)} data-testid="btn-prev">← Prev</button>}
          <span className="pag-current">{page} / {pagination.total_pages}</span>
          {page < pagination.total_pages && <button className="pag-btn" onClick={() => setPage(p => p + 1)} data-testid="btn-next">Next →</button>}
        </div>
      )}
    </PublicLayout>
  );
}
