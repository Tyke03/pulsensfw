import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { useEffect } from 'react';

function StatCard({ label, value, sub, color = 'var(--pulse-red)' }: any) {
  return (
    <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '24px', minWidth: 0 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 'clamp(1.8rem, 2.5vw, 2.4rem)', fontWeight: 700, color, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: 'var(--pulse-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!auth.isLoggedIn()) navigate('/admin');
  }, []);

  const { data: postsData } = useQuery({
    queryKey: ['/api/admin/posts/stats'],
    queryFn: () => fetch('/api/admin/posts?per_page=100', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const { data: draftsData } = useQuery({
    queryKey: ['/api/admin/posts/drafts'],
    queryFn: () => fetch('/api/admin/posts?status=draft&per_page=20', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['/api/admin/analytics'],
    queryFn: () => fetch('/api/admin/analytics', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const allPosts = postsData?.data || [];
  const published = allPosts.filter((p: any) => p.status === 'published').length;
  const drafts = draftsData?.data || [];
  const analytics = analyticsData?.data || {};

  return (
    <AdminLayout>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Dashboard</h1>
        <p style={{ color: 'var(--pulse-muted)', fontSize: '0.9rem', marginTop: 4 }}>Welcome back to PulseNSFW</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
        <StatCard label="Published" value={published} sub="Live articles" />
        <StatCard label="Drafts" value={drafts.length} sub="Awaiting QC" color="#888" />
        <StatCard label="Total Posts" value={allPosts.length} />
        <StatCard label="Pageviews" value={analytics.total_pageviews || 0} sub="All time" color="#4fa3a8" />
      </div>

      {drafts.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', color: '#fff' }}>Draft Queue ({drafts.length})</h2>
            <a href="#/admin/posts" style={{ fontSize: '0.8rem', color: 'var(--pulse-red)' }}>View all →</a>
          </div>
          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
            {drafts.slice(0, 8).map((post: any, i: number) => (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: i < drafts.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', marginTop: 2 }}>{post.category} · ID #{post.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                  <button
                    data-testid={`btn-publish-${post.id}`}
                    onClick={async () => {
                      await fetch(`/api/admin/posts/${post.id}/publish`, { method: 'POST', headers: authHeaders() });
                      window.location.reload();
                    }}
                    style={{ background: 'rgba(0,200,100,0.12)', color: '#00c864', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 100, padding: '4px 14px', fontSize: '0.75rem', cursor: 'pointer' }}>
                    Publish
                  </button>
                  <a href={`#/admin/posts/${post.id}/edit`} style={{ background: 'var(--pulse-dark)', color: 'var(--pulse-muted)', border: '1px solid var(--pulse-border)', borderRadius: 100, padding: '4px 14px', fontSize: '0.75rem', textDecoration: 'none' }}>
                    Edit
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(analytics.top_pages || []).length > 0 && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.1rem', color: '#fff', marginBottom: 16 }}>Top Pages</h2>
          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
            {(analytics.top_pages || []).slice(0, 5).map((page: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < 4 ? '1px solid var(--pulse-border)' : 'none', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--pulse-muted)', fontFamily: 'monospace' }}>{page.path}</span>
                <span style={{ color: 'var(--pulse-red)', fontWeight: 600 }}>{page.views}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
