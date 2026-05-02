import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function AdminTokens() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, refetch } = useQuery({
    queryKey: ['/api/admin/tokens'],
    queryFn: () => fetch('/api/admin/tokens', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const tokens = data?.data || [];

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/tokens', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label: label || 'New Token' }) });
    const data = await res.json();
    if (!data.success) return toast({ title: 'Error', description: data.error, variant: 'destructive' });
    setNewToken(data.data.token);
    setLabel('');
    refetch();
    toast({ title: 'Token created', description: 'Copy it now — it will not be shown again.' });
  }

  async function revokeToken(id: number, tokenLabel: string) {
    if (!confirm(`Revoke token "${tokenLabel}"? Any agents using it will lose access.`)) return;
    await fetch(`/api/admin/tokens/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast({ title: 'Revoked', description: `"${tokenLabel}" has been revoked.` });
    refetch();
  }

  return (
    <AdminLayout>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>API Tokens</h1>
        <p style={{ color: 'var(--pulse-muted)', fontSize: '0.85rem', marginTop: 4 }}>Generate tokens for Perplexity Computer, cron jobs, and external agents.</p>
      </div>

      <form onSubmit={createToken} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', color: '#fff', marginBottom: 16 }}>Generate New Token</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--pulse-muted)', marginBottom: 6 }}>Token Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Perplexity Computer, Weekly Cron" data-testid="input-token-label"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', fontSize: '0.88rem' }} />
          </div>
          <button type="submit" data-testid="btn-generate-token"
            style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 100, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Generate Token
          </button>
        </div>

        {newToken && (
          <div style={{ marginTop: 20, background: 'rgba(0,200,100,0.06)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.8rem', color: '#00c864', marginBottom: 8, fontWeight: 600 }}>✓ Token created — copy it now, it won't be shown again</div>
            <code style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.82rem', color: '#fff', wordBreak: 'break-all', background: 'var(--pulse-dark)', padding: 12, borderRadius: 6 }}>
              {newToken}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(newToken); toast({ title: 'Copied!' }); }}
              style={{ marginTop: 10, fontSize: '0.78rem', color: '#00c864', background: 'none', border: '1px solid rgba(0,200,100,0.3)', padding: '5px 14px', borderRadius: 100, cursor: 'pointer' }}>
              Copy to clipboard
            </button>
          </div>
        )}
      </form>

      <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
        {tokens.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--pulse-muted)' }}>No tokens yet.</div>
        ) : tokens.map((t: any, i: number) => (
          <div key={t.id} data-testid={`row-token-${t.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < tokens.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{t.label}</span>
                {t.revokedAt && <span style={{ fontSize: '0.7rem', color: '#ff6b8a', background: 'rgba(255,45,85,0.08)', padding: '2px 8px', borderRadius: 4 }}>REVOKED</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--pulse-muted)', fontFamily: 'monospace' }}>{t.token}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', marginTop: 3 }}>
                Created {new Date(t.createdAt).toLocaleDateString()}
                {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
              </div>
            </div>
            {!t.revokedAt && (
              <button onClick={() => revokeToken(t.id, t.label)} data-testid={`btn-revoke-${t.id}`}
                style={{ fontSize: '0.75rem', color: '#ff6b8a', background: 'none', border: '1px solid rgba(255,45,85,0.2)', padding: '5px 14px', borderRadius: 100, cursor: 'pointer', marginLeft: 16 }}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
