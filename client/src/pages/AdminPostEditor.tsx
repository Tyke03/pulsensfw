import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { CATEGORIES } from '../lib/api';
import { useToast } from '@/hooks/use-toast';

export default function AdminPostEditor() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: '', slug: '', body: '', excerpt: '', category: 'ai-chatbots',
    tags: '', status: 'draft', meta_title: '', meta_description: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  useEffect(() => {
    if (!isEdit) return;
    setFetching(true);
    fetch(`/api/admin/posts/${id}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const p = data.data;
        setForm({
          title: p.title || '', slug: p.slug || '', body: p.body || '',
          excerpt: p.excerpt || '', category: p.category || 'ai-chatbots',
          tags: (p.tags || []).join(', '), status: p.status || 'draft',
          meta_title: p.meta_title || '', meta_description: p.meta_description || '',
        });
      }).finally(() => setFetching(false));
  }, [id]);

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function set(key: string, val: string) {
    setForm(f => {
      const next = { ...f, [key]: val };
      if (key === 'title' && !isEdit) next.slug = slugify(val);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      const url = isEdit ? `/api/admin/posts/${id}` : '/api/admin/posts';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast({ title: isEdit ? 'Saved' : 'Created', description: `"${form.title}" has been ${isEdit ? 'updated' : 'created'}.` });
      navigate('/admin/posts');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem' };
  const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--pulse-muted)', marginBottom: 6, fontWeight: 500 };

  if (fetching) return <AdminLayout><div style={{ color: 'var(--pulse-muted)' }}>Loading…</div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
          {isEdit ? 'Edit Post' : 'New Post'}
        </h1>
        <a href="#/admin/posts" style={{ fontSize: '0.85rem', color: 'var(--pulse-muted)' }}>← Back</a>
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 800 }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} required style={inputStyle} data-testid="input-title" placeholder="Article title" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Slug</label>
              <input value={form.slug} onChange={e => set('slug', e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.82rem' }} data-testid="input-slug" />
            </div>
            <div>
              <label style={labelStyle}>Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle} data-testid="select-category">
                {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Excerpt (1-2 sentences for preview)</label>
            <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} data-testid="input-excerpt" />
          </div>

          <div>
            <label style={labelStyle}>Body (HTML) *</label>
            <textarea value={form.body} onChange={e => set('body', e.target.value)} rows={18} required style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.6 }} data-testid="input-body" placeholder="<p>Your article content here...</p>" />
            <div style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', marginTop: 4 }}>Use HTML: &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;. Target 800–1500 words.</div>
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} style={inputStyle} data-testid="input-tags" placeholder="ai, review, 2026" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>SEO Title (60 chars max)</label>
              <input value={form.meta_title} onChange={e => set('meta_title', e.target.value)} maxLength={60} style={inputStyle} data-testid="input-meta-title" />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle} data-testid="select-status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>SEO Description (155 chars max)</label>
            <input value={form.meta_description} onChange={e => set('meta_description', e.target.value)} maxLength={155} style={inputStyle} data-testid="input-meta-desc" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button type="submit" disabled={loading} data-testid="btn-save"
            style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: 100, fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Post')}
          </button>
          <a href="#/admin/posts"
            style={{ background: 'var(--pulse-card)', color: 'var(--pulse-muted)', border: '1px solid var(--pulse-border)', padding: '12px 24px', borderRadius: 100, fontSize: '0.9rem', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </AdminLayout>
  );
}
