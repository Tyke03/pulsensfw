import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { CATEGORIES } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const TRACKING_STATUS: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  real:        { label: 'REAL',        bg: 'rgba(0,200,100,0.12)',   color: '#00c864', icon: '✓' },
  placeholder: { label: 'PLACEHOLDER', bg: 'rgba(255,193,7,0.12)',   color: '#ffc107', icon: '⚠' },
  broken:      { label: 'BROKEN',      bg: 'rgba(255,60,60,0.12)',   color: '#ff3c3c', icon: '✗' },
  unverified:  { label: 'UNVERIFIED',  bg: 'rgba(120,120,120,0.12)', color: '#888',    icon: '?' },
};

const OP_STATUS: Record<string, { label: string; color: string }> = {
  new:      { label: 'NEW',      color: '#4fa3a8' },
  reviewed: { label: 'REVIEWED', color: '#ffc107' },
  enrolled: { label: 'ENROLLED', color: '#00c864' },
  rejected: { label: 'REJECTED', color: '#888' },
};

export default function AdminAffiliates() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'registry' | 'opportunities'>('registry');
  const [form, setForm] = useState({
    name: '', url: '', category: '', description: '',
    commission_notes: '', signupUrl: '', commissionRate: '', notes: '',
  });

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, refetch } = useQuery({
    queryKey: ['/api/admin/affiliates'],
    queryFn: () => fetch('/api/admin/affiliates', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const { data: opData } = useQuery({
    queryKey: ['/api/affiliates/opportunities'],
    queryFn: () => fetch('/api/affiliates/opportunities', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn() && activeTab === 'opportunities',
  });

  const affiliates = data?.data || [];
  const opportunities: any[] = opData?.data || [];

  // Count by tracking status for the summary badges
  const statusCounts = affiliates.reduce((acc: any, a: any) => {
    const s = a.trackingStatus || a.tracking_status || 'unverified';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const inputStyle = {
    width: '100%', padding: '9px 13px',
    background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)',
    borderRadius: 8, color: 'var(--pulse-light)', fontSize: '0.88rem',
    boxSizing: 'border-box' as const,
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/affiliates', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!d.success) return toast({ title: 'Error', description: d.error, variant: 'destructive' });
    toast({ title: 'Added', description: `${form.name} added to registry.` });
    setForm({ name: '', url: '', category: '', description: '', commission_notes: '', signupUrl: '', commissionRate: '', notes: '' });
    setShowForm(false);
    refetch();
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/admin/affiliates/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ active: !active }),
    });
    refetch();
  }

  async function deleteAffiliate(id: number, name: string) {
    if (!confirm(`Remove ${name} from the affiliate registry?`)) return;
    await fetch(`/api/admin/affiliates/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast({ title: 'Removed', description: `${name} removed.` });
    refetch();
  }

  async function updateOpStatus(name: string, status: string) {
    const encoded = encodeURIComponent(name);
    await fetch(`/api/affiliates/opportunities/${encoded}`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/affiliates/opportunities'] });
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 500 as const,
    cursor: 'pointer', border: 'none',
    background: active ? 'var(--pulse-red)' : 'transparent',
    color: active ? '#fff' : 'var(--pulse-muted)',
    transition: 'all 0.15s',
  });

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>
            Affiliate Registry
          </h1>
          <p style={{ color: 'var(--pulse-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Manage partners and review discovered opportunities
          </p>
        </div>
        {activeTab === 'registry' && (
          <button onClick={() => setShowForm(s => !s)} data-testid="btn-add-affiliate"
            style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 100, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
            + Add Partner
          </button>
        )}
      </div>

      {/* Tracking status summary */}
      {affiliates.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const }}>
          {Object.entries(TRACKING_STATUS).map(([key, s]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 100, padding: '4px 12px' }}>
                <span style={{ color: s.color, fontSize: '0.75rem', fontWeight: 700 }}>{s.icon} {count} {s.label}</span>
              </div>
            );
          })}
          {(statusCounts.placeholder > 0 || statusCounts.broken > 0) && (
            <div style={{ fontSize: '0.75rem', color: '#ffc107', alignSelf: 'center', marginLeft: 4 }}>
              ⚠ Real affiliate tracking URLs needed — run affiliate agent or update manually
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button style={tabStyle(activeTab === 'registry')} onClick={() => setActiveTab('registry')}>
          Registry ({affiliates.length})
        </button>
        <button style={tabStyle(activeTab === 'opportunities')} onClick={() => setActiveTab('opportunities')}>
          Opportunities {opportunities.length > 0 ? `(${opportunities.filter((o: any) => o.status === 'new').length} new)` : ''}
        </button>
      </div>

      {/* ── REGISTRY TAB ── */}
      {activeTab === 'registry' && (
        <>
          {showForm && (
            <form onSubmit={handleCreate} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', color: '#fff', marginBottom: 16 }}>New Affiliate Partner</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Partner Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} data-testid="input-aff-name" placeholder="e.g. CrushOn.AI" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Affiliate Tracking URL *</label>
                  <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} required style={inputStyle} data-testid="input-aff-url" placeholder="https://...?ref=pulsensfw" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Commission Rate</label>
                  <input value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} style={inputStyle} placeholder="e.g. 20% per sale" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Signup URL</label>
                  <input value={form.signupUrl} onChange={e => setForm(f => ({ ...f, signupUrl: e.target.value }))} style={inputStyle} placeholder="Direct affiliate signup page" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Notes</label>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} placeholder="Enrollment date, network, payout threshold…" />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--pulse-muted)', marginBottom: 5 }}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} placeholder="One honest sentence about what they offer" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '9px 24px', borderRadius: 100, fontSize: '0.85rem', cursor: 'pointer' }}>Add to Registry</button>
                <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', color: 'var(--pulse-muted)', border: '1px solid var(--pulse-border)', padding: '9px 24px', borderRadius: 100, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
            {affiliates.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--pulse-muted)' }}>
                No affiliates yet. Add your first partner above.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                    {['Partner', 'Category', 'Tracking URL', 'Commission', 'Tracking Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--pulse-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map((aff: any, i: number) => {
                    const ts = aff.trackingStatus || aff.tracking_status || 'unverified';
                    const s = TRACKING_STATUS[ts] || TRACKING_STATUS.unverified;
                    return (
                      <tr key={aff.id} data-testid={`row-aff-${aff.id}`} style={{ borderBottom: i < affiliates.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.88rem' }}>{aff.name}</div>
                          {aff.description && <div style={{ fontSize: '0.73rem', color: 'var(--pulse-muted)', marginTop: 2 }}>{aff.description}</div>}
                          {!aff.active && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: 2 }}>inactive</div>}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {aff.category ? (
                            <span style={{ fontSize: '0.72rem', color: 'var(--pulse-red)', background: 'rgba(255,45,85,0.08)', padding: '2px 8px', borderRadius: 4 }}>{aff.category}</span>
                          ) : <span style={{ color: '#444', fontSize: '0.75rem' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 16px', maxWidth: 200 }}>
                          <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {aff.url}
                          </div>
                          {aff.signupUrl && (
                            <a href={aff.signupUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: '#4fa3a8', marginTop: 2, display: 'block' }}>
                              Signup page ↗
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#4fa3a8' }}>
                          {aff.commissionRate || aff.commission_notes || <span style={{ color: '#444' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color, borderRadius: 100, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
                            {s.icon} {s.label}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => toggleActive(aff.id, aff.active)}
                              style={{ fontSize: '0.73rem', color: aff.active ? '#00c864' : 'var(--pulse-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              {aff.active ? 'Active' : 'Inactive'}
                            </button>
                            <button onClick={() => deleteAffiliate(aff.id, aff.name)}
                              style={{ fontSize: '0.73rem', color: '#ff6b8a', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── OPPORTUNITIES TAB ── */}
      {activeTab === 'opportunities' && (
        <div>
          <div style={{ fontSize: '0.82rem', color: 'var(--pulse-muted)', marginBottom: 16 }}>
            Discovered by the affiliate agent. Review and mark — enrollment requires human action at the signup URL.
          </div>

          {opportunities.length === 0 ? (
            <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--pulse-muted)' }}>
              No opportunities yet. The affiliate agent runs daily at 02:00 UTC and writes to{' '}
              <code style={{ fontSize: '0.8rem', color: '#888' }}>/agents/affiliate-manager/opportunities.md</code>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {opportunities.map((op: any, i: number) => {
                const s = OP_STATUS[op.status] || OP_STATUS.new;
                return (
                  <div key={i} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '16px 20px' }} data-testid={`op-${i}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{op.name}</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: s.color, background: `${s.color}18`, borderRadius: 100, padding: '2px 9px' }}>{s.label}</span>
                          {op.category && <span style={{ fontSize: '0.7rem', color: 'var(--pulse-red)', background: 'rgba(255,45,85,0.08)', padding: '2px 8px', borderRadius: 4 }}>{op.category}</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px 20px', fontSize: '0.78rem' }}>
                          {op.commission && <div><span style={{ color: '#555' }}>Commission: </span><span style={{ color: '#4fa3a8' }}>{op.commission}</span></div>}
                          {op.network && <div><span style={{ color: '#555' }}>Network: </span><span style={{ color: '#aaa' }}>{op.network}</span></div>}
                          {op.adultAccepted && <div><span style={{ color: '#555' }}>Adult OK: </span><span style={{ color: op.adultAccepted === 'Y' ? '#00c864' : '#888' }}>{op.adultAccepted}</span></div>}
                          {op.barriers && op.barriers !== 'none stated' && <div><span style={{ color: '#555' }}>Barriers: </span><span style={{ color: '#ffc107' }}>{op.barriers}</span></div>}
                          {op.found && <div><span style={{ color: '#555' }}>Found: </span><span style={{ color: '#666' }}>{op.found}</span></div>}
                        </div>
                        {op.signupUrl && (
                          <a href={op.signupUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-block', marginTop: 8, fontSize: '0.78rem', color: '#4fa3a8', textDecoration: 'none', background: 'rgba(79,163,168,0.1)', padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(79,163,168,0.2)' }}>
                            Open Signup Page ↗
                          </a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexDirection: 'column', minWidth: 120 }}>
                        {['new', 'reviewed', 'enrolled', 'rejected'].map(st => (
                          <button key={st} onClick={() => updateOpStatus(op.name, st)}
                            style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${op.status === st ? OP_STATUS[st].color : 'var(--pulse-border)'}`, background: op.status === st ? `${OP_STATUS[st].color}18` : 'transparent', color: op.status === st ? OP_STATUS[st].color : '#555', transition: 'all 0.15s' }}>
                            {st.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
