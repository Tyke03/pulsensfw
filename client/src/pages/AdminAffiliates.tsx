import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { CATEGORIES } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function AdminAffiliates() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', category: '', description: '', commission_notes: '' });

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, refetch } = useQuery({
    queryKey: ['/api/admin/affiliates'],
    queryFn: () => fetch('/api/admin/affiliates', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const affiliates = data?.data || [];
  const inputStyle = { width: '100%', padding: '9px 13px', background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', fontSize: '0.88rem' };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/affiliates', { method: 'POST', headers: authHeaders(), body: JSON.stringify(form) });
    const data = await res.json();
    if (!data.success) return toast({ title: 'Error', description: data.error, variant: 'destructive' });
    toast({ title: 'Added', description: `${form.name} added to registry.` });
    setForm({ name: '', url: '', category: '', description: '', commission_notes: '' });
    setShowForm(false);
    refetch();
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/admin/affiliates/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ active: !active }) });
    refetch();
  }

  async function deleteAffiliate(id: number, name: string) {
    if (!confirm(`Remove ${name} from the affiliate registry?`)) return;
    await fetch(`/api/admin/affiliates/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast({ title: 'Removed', description: `${name} removed.` });
    refetch();
  }

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Affiliate Registry</h1>
          <p style={{ color: 'var(--pulse-muted)', fontSize: '0.85rem', marginTop: 4 }}>All active affiliate partners — automatically injected into relevant articles.</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} data-testid="btn-add-affiliate"
          style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 100, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
          + Add Partner
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', color: '#fff', marginBottom: 16 }}>New Affiliate Partner</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div><label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Partner Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} data-testid="input-aff-name" placeholder="e.g. CrushOn.AI" /></div>
            <div><label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Affiliate URL *</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required style={inputStyle} data-testid="input-aff-url" placeholder="https://..." /></div>
            <div><label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select></div>
            <div><label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Commission Notes</label>
              <input value={form.commission_notes} onChange={e => setForm(f => ({ ...f, commission_notes: e.target.value }))} style={inputStyle} placeholder="e.g. 20% recurring" /></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} placeholder="Brief description of the service" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '9px 24px', borderRadius: 100, fontSize: '0.85rem', cursor: 'pointer' }}>Add to Registry</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', color: 'var(--pulse-muted)', border: '1px solid var(--pulse-border)', padding: '9px 24px', borderRadius: 100, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
        {affiliates.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--pulse-muted)' }}>No affiliates yet. Add your first partner above.</div>
        ) : affiliates.map((aff: any, i: number) => (
          <div key={aff.id} data-testid={`row-aff-${aff.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < affiliates.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{aff.name}</span>
                {aff.category && <span style={{ fontSize: '0.7rem', color: 'var(--pulse-red)', background: 'rgba(255,45,85,0.08)', padding: '2px 8px', borderRadius: 4 }}>{aff.category}</span>}
                {!aff.active && <span style={{ fontSize: '0.7rem', color: 'var(--pulse-muted)', background: 'rgba(136,136,160,0.08)', padding: '2px 8px', borderRadius: 4 }}>inactive</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--pulse-muted)' }}>{aff.url}</div>
              {aff.commission_notes && <div style={{ fontSize: '0.75rem', color: '#4fa3a8', marginTop: 2 }}>💰 {aff.commission_notes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
              <button onClick={() => toggleActive(aff.id, aff.active)} style={{ fontSize: '0.75rem', color: aff.active ? '#00c864' : 'var(--pulse-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {aff.active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => deleteAffiliate(aff.id, aff.name)} style={{ fontSize: '0.75rem', color: '#ff6b8a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
