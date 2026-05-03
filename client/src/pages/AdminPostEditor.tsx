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
  const [seoWarning, setSeoWarning] = useState(false);

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
          meta_title: p.metaTitle || p.meta_title || '',
          meta_description: p.metaDescription || p.meta_description || '',
        });
      }).finally(() => setFetching(false));
  }, [id]);

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function set(key: string, val: string) {
    setForm(f => {
      const next = { ...f, [key]: val };
      // Auto-slug from title on new posts
      if (key === 'title' && !isEdit) next.slug = slugify(val);
      // Auto-fill SEO title from title if empty
      if (key === 'title' && !f.meta_title) {
        next.meta_title = val.slice(0, 60);
      }
      // Auto-fill SEO description from excerpt if empty
      if (key === 'excerpt' && !f.meta_description) {
        next.meta_description = val.slice(0, 155);
      }
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Block publish if SEO fields are empty
    if (form.status === 'published' && (!form.meta_title.trim() || !form.meta_description.trim())) {
      setSeoWarning(true);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      toast({
        title: 'SEO fields required to publish',
        description: 'Fill in SEO Title and SEO Description before publishing.',
        variant: 'destructive',
      });
      return;
    }
    setSeoWarning(false);
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

  const metaTitleLen = form.meta_title.length;
  const metaDescLen = form.meta_description.length;
  const metaTitleOk = metaTitleLen >= 30 && metaTitleLen <= 60;
  const metaDescOk = metaDescLen >= 100 && metaDescLen <= 155;
  const metaTitleEmpty = metaTitleLen === 0;
  const metaDescEmpty = metaDescLen === 0;

  function charColor(len: number, min: number, max: number) {
    if (len === 0) return 'var(--pulse-muted)';
    if (len < min) return '#f59e0b'; // amber — too short
    if (len > max) return 'var(--pulse-red)'; // red — too long
    return '#22c55e'; // green — good
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', background: 'var(--pulse-dark)',
    border: '1px solid var(--pulse-border)', borderRadius: 8,
    color: 'var(--pulse-light)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem',
  };
  const seoInputStyle = (empty: boolean, ok: boolean, warn: boolean) => ({
    ...inputStyle,
    border: `1px solid ${warn && empty ? 'var(--pulse-red)' : ok ? '#22c55e33' : 'var(--pulse-border)'}`,
    boxShadow: warn && empty ? '0 0 0 2px rgba(255,45,85,0.15)' : ok ? '0 0 0 2px rgba(34,197,94,0.08)' : 'none',
    transition: 'border 0.15s, box-shadow 0.15s',
  });
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

          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} required style={inputStyle} placeholder="Article title" />
          </div>

          {/* Slug + Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Slug</label>
              <input value={form.slug} onChange={e => set('slug', e.target.value)} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.82rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Excerpt */}
          <div>
            <label style={labelStyle}>Excerpt <span style={{ color: 'var(--pulse-muted)', fontWeight: 400 }}>(1–2 sentences — also auto-fills SEO description)</span></label>
            <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Body */}
          <div>
            <label style={labelStyle}>Body (HTML or Markdown) *</label>
            <textarea value={form.body} onChange={e => set('body', e.target.value)} rows={18} required
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.6 }}
              placeholder="<p>Your article content here...</p>" />
            <div style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', marginTop: 4 }}>
              HTML: &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt; — or plain Markdown. Target 800–1500 words.
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} style={inputStyle} placeholder="ai, review, 2026" />
          </div>

          {/* SEO Section */}
          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '20px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--pulse-red)', textTransform: 'uppercase' }}>SEO</span>
              {form.status === 'published' && (metaTitleEmpty || metaDescEmpty) && (
                <span style={{ fontSize: '0.72rem', background: 'rgba(255,45,85,0.12)', color: 'var(--pulse-red)', padding: '2px 8px', borderRadius: 4 }}>
                  Required to publish
                </span>
              )}
              {metaTitleOk && metaDescOk && (
                <span style={{ fontSize: '0.72rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '2px 8px', borderRadius: 4 }}>
                  ✓ Looks good
                </span>
              )}
            </div>

            {/* SEO Title */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  SEO Title {form.status === 'published' ? '*' : ''}
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>(50–60 chars ideal)</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: charColor(metaTitleLen, 30, 60), fontVariantNumeric: 'tabular-nums' }}>
                  {metaTitleLen}/60
                </span>
              </div>
              <input
                value={form.meta_title}
                onChange={e => set('meta_title', e.target.value)}
                maxLength={60}
                style={seoInputStyle(metaTitleEmpty, metaTitleOk, seoWarning)}
                placeholder="Primary keyword near the front — matches search intent"
              />
              {metaTitleLen > 0 && metaTitleLen < 30 && (
                <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: 4 }}>Too short — aim for 50–60 characters for best visibility.</div>
              )}
            </div>

            {/* SEO Description */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  SEO Description {form.status === 'published' ? '*' : ''}
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>(140–155 chars ideal)</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: charColor(metaDescLen, 100, 155), fontVariantNumeric: 'tabular-nums' }}>
                  {metaDescLen}/155
                </span>
              </div>
              <textarea
                value={form.meta_description}
                onChange={e => set('meta_description', e.target.value)}
                maxLength={155}
                rows={3}
                style={{ ...seoInputStyle(metaDescEmpty, metaDescOk, seoWarning), resize: 'none' }}
                placeholder="Include the primary keyword. Give readers a reason to click — what will they walk away knowing?"
              />
              {metaDescLen > 0 && metaDescLen < 100 && (
                <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: 4 }}>Too short — aim for 140–155 characters. Google truncates anything over 155.</div>
              )}
            </div>

            {/* SERP Preview */}
            {(form.meta_title || form.title) && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--pulse-bg)', borderRadius: 8, border: '1px solid var(--pulse-border)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--pulse-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Google Preview</div>
                <div style={{ fontSize: '0.85rem', color: '#4a9eff', fontWeight: 500, marginBottom: 2 }}>
                  {form.meta_title || form.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#4caf50', marginBottom: 4 }}>
                  pulsensfw.com/{form.slug || '...'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#ccc', lineHeight: 1.5 }}>
                  {form.meta_description || <span style={{ color: 'var(--pulse-muted)', fontStyle: 'italic' }}>No description — Google will pull random text from the article.</span>}
                </div>
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
              {form.status === 'published' && (metaTitleEmpty || metaDescEmpty) && (
                <div style={{ fontSize: '0.72rem', color: 'var(--pulse-red)', marginTop: 4 }}>
                  ⚠ SEO Title + Description required before publishing.
                </div>
              )}
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button type="submit" disabled={loading}
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
