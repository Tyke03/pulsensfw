import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { queryClient } from '../lib/queryClient';
import { CATEGORIES } from '../lib/api';
import { useToast } from '@/hooks/use-toast';

export default function AdminPosts() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/posts', statusFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: '50' });
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      return fetch(`/api/admin/posts?${params}`, { headers: authHeaders() }).then(r => r.json());
    },
    enabled: auth.isLoggedIn(),
  });

  const posts = data?.data || [];

  async function publish(id: number) {
    await fetch(`/api/admin/posts/${id}/publish`, { method: 'POST', headers: authHeaders() });
    toast({ title: 'Published', description: `Post #${id} is now live.` });
    refetch();
  }

  async function unpublish(id: number) {
    await fetch(`/api/admin/posts/${id}/unpublish`, { method: 'POST', headers: authHeaders() });
    toast({ title: 'Unpublished', description: `Post #${id} moved to drafts.` });
    refetch();
  }

  async function deletePost(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/posts/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast({ title: 'Deleted', description: `"${title}" has been deleted.` });
    refetch();
  }

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Posts</h1>
        <a href="#/admin/posts/new" data-testid="btn-new-post"
          style={{ background: 'var(--pulse-red)', color: '#fff', padding: '10px 24px', borderRadius: 100, fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none' }}>
          + New Post
        </a>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="filter-status"
          style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', padding: '8px 12px', fontSize: '0.85rem' }}>
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} data-testid="filter-category"
          style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', padding: '8px 12px', fontSize: '0.85rem' }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div>Loading…</div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><h2>No posts found</h2></div>
      ) : (
        <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['ID', 'Title', 'Category', 'Status', 'QC', 'Published', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '0.72rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 16px', borderBottom: '1px solid var(--pulse-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map((post: any) => (
                <tr key={post.id} data-testid={`row-post-${post.id}`} style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                  <td style={{ padding: '14px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>#{post.id}</td>
                  <td style={{ padding: '14px 16px', maxWidth: 300 }}>
                    <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', marginTop: 2 }}>{post.slug}</div>
                    {post.researchSource && <div style={{ fontSize: '0.68rem', color: '#4fa3a8', marginTop: 2, fontFamily: 'monospace' }}>📎 {post.researchSource}</div>}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>{post.category}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 100, fontWeight: 500,
                      background: post.status === 'published' ? 'rgba(0,200,100,0.12)' : 'rgba(136,136,160,0.12)',
                      color: post.status === 'published' ? '#00c864' : 'var(--pulse-muted)' }}>
                      {post.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {(() => {
                      const qcs = post.qcStatus || post.qc_status || 'pending';
                      const QC_MAP: Record<string, { label: string; color: string; bg: string }> = {
                        approved:        { label: 'APPROVED',  color: '#00c864', bg: 'rgba(0,200,100,0.1)' },
                        revision_needed: { label: 'REVISION',  color: '#ffc107', bg: 'rgba(255,193,7,0.1)' },
                        fact_check:      { label: 'FACT CHK',  color: '#ff6b35', bg: 'rgba(255,107,53,0.1)' },
                        pending:         { label: 'PENDING',   color: '#555',    bg: 'rgba(85,85,85,0.1)'   },
                      };
                      const s = QC_MAP[qcs] || QC_MAP.pending;
                      return (
                        <span title={post.qcNotes || post.qc_notes || ''} style={{ fontSize: '0.68rem', fontWeight: 700, background: s.bg, color: s.color, borderRadius: 100, padding: '2px 9px', cursor: post.qcNotes ? 'help' : 'default', whiteSpace: 'nowrap' as const }}>
                          {s.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>
                    {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={`#/admin/posts/${post.id}/edit`} style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', textDecoration: 'none' }}>Edit</a>
                      {post.status === 'draft'
                        ? <button onClick={() => publish(post.id)} data-testid={`btn-publish-${post.id}`} style={{ fontSize: '0.75rem', color: '#00c864', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Publish</button>
                        : <button onClick={() => unpublish(post.id)} data-testid={`btn-unpublish-${post.id}`} style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Unpublish</button>
                      }
                      <button onClick={() => deletePost(post.id, post.title)} data-testid={`btn-delete-${post.id}`} style={{ fontSize: '0.75rem', color: '#ff6b8a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
