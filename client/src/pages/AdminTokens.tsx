import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

const AGENT_META: Record<string, { name: string; icon: string }> = {
  'agent:writer-1': { name: 'Writer 1 — AI Chatbots', icon: '🤖' },
  'agent:writer-2': { name: 'Writer 2 — Sex Tech', icon: '⚡' },
  'agent:writer-3': { name: 'Writer 3 — VR & Immersive', icon: '🥽' },
  'agent:writer-4': { name: 'Writer 4 — Industry News', icon: '📰' },
  'agent:writer-5': { name: 'Writer 5 — How-To & Guides', icon: '📖' },
  'agent:writer-6': { name: 'Writer 6 — Rankings & Lists', icon: '⚡' },
  'agent:research-hub': { name: 'Research Hub', icon: '🔬' },
};

function isAgentToken(label: string) {
  return label?.startsWith('agent:');
}

export default function AdminTokens() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenLabel, setNewTokenLabel] = useState('');

  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, refetch } = useQuery({
    queryKey: ['/api/admin/tokens'],
    queryFn: () => fetch('/api/admin/tokens', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const tokens: any[] = data?.data || [];
  const agentTokens = tokens.filter(t => isAgentToken(t.label));
  const manualTokens = tokens.filter(t => !isAgentToken(t.label));

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/tokens', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ label: label || 'New Token' }),
    });
    const data = await res.json();
    if (!data.success) return toast({ title: 'Error', description: data.error, variant: 'destructive' });
    setNewToken(data.data.token);
    setNewTokenLabel(label || 'New Token');
    setLabel('');
    refetch();
    toast({ title: 'Token created', description: 'Copy it now — it will not be shown again.' });
  }

  async function revokeToken(id: number, tokenLabel: string) {
    const isAgent = isAgentToken(tokenLabel);
    const agentMeta = AGENT_META[tokenLabel];
    const name = agentMeta ? agentMeta.name : tokenLabel;
    const msg = isAgent
      ? `Kill switch: revoke token for ${name}? This agent will immediately lose API access.`
      : `Revoke token "${tokenLabel}"?`;
    if (!confirm(msg)) return;
    await fetch(`/api/admin/tokens/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast({
      title: isAgent ? `${name} offline` : 'Token revoked',
      description: isAgent ? 'Agent token revoked. Re-seed to restore access.' : `"${tokenLabel}" has been revoked.`,
    });
    refetch();
  }

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', fontSize: '0.88rem' };

  return (
    <AdminLayout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>API Tokens</h1>
        <p style={{ color: 'var(--pulse-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Each agent has its own token. Revoke to pause an agent without touching the others.
        </p>
      </div>

      {/* ── Agent Tokens ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pulse-red)' }}>Agent Fleet</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)' }}>
            {agentTokens.filter(t => !t.revokedAt).length}/{agentTokens.length} online
          </span>
        </div>

        <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
          {agentTokens.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--pulse-muted)', fontSize: '0.85rem' }}>
              No agent tokens found. Run <code style={{ fontFamily: 'monospace', color: '#fff' }}>npm run seed-agents</code> to create them.
            </div>
          ) : agentTokens.map((t: any, i: number) => {
            const meta = AGENT_META[t.label];
            const isOnline = !t.revokedAt;
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < agentTokens.length - 1 ? '1px solid var(--pulse-border)' : 'none',
                background: !isOnline ? 'rgba(255,45,85,0.03)' : undefined,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isOnline ? '#22c55e' : '#ff2d55',
                    boxShadow: isOnline ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: isOnline ? '#fff' : 'var(--pulse-muted)' }}>
                        {meta ? `${meta.icon} ${meta.name}` : t.label}
                      </span>
                      {!isOnline && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--pulse-red)', background: 'rgba(255,45,85,0.1)', padding: '1px 7px', borderRadius: 3, fontWeight: 600 }}>
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--pulse-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
                      {t.token}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--pulse-muted)', marginTop: 2 }}>
                      Seeded {new Date(t.createdAt).toLocaleDateString()}
                      {t.lastUsedAt && <span style={{ color: '#22c55e' }}> · Last active {new Date(t.lastUsedAt).toLocaleDateString()}</span>}
                      {t.revokedAt && <span style={{ color: 'var(--pulse-red)' }}> · Revoked {new Date(t.revokedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>

                {isOnline ? (
                  <button onClick={() => revokeToken(t.id, t.label)}
                    style={{ fontSize: '0.75rem', color: '#ff6b8a', background: 'none', border: '1px solid rgba(255,45,85,0.25)', padding: '5px 14px', borderRadius: 100, cursor: 'pointer', marginLeft: 16, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    Kill switch
                  </button>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', marginLeft: 16, flexShrink: 0 }}>Re-seed to restore</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Manual / Human Tokens ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pulse-muted)', marginBottom: 14 }}>Manual Tokens</div>
        <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
          {manualTokens.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--pulse-muted)', fontSize: '0.85rem' }}>No manual tokens yet.</div>
          ) : manualTokens.map((t: any, i: number) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < manualTokens.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{t.label}</span>
                  {t.revokedAt && <span style={{ fontSize: '0.7rem', color: '#ff6b8a', background: 'rgba(255,45,85,0.08)', padding: '2px 8px', borderRadius: 4 }}>REVOKED</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--pulse-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>{t.token}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', marginTop: 3 }}>
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              {!t.revokedAt && (
                <button onClick={() => revokeToken(t.id, t.label)}
                  style={{ fontSize: '0.75rem', color: '#ff6b8a', background: 'none', border: '1px solid rgba(255,45,85,0.2)', padding: '5px 14px', borderRadius: 100, cursor: 'pointer', marginLeft: 16, flexShrink: 0 }}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Generate New Token ── */}
      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pulse-muted)', marginBottom: 14 }}>Generate Token</div>
      <form onSubmit={createToken} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--pulse-muted)', marginBottom: 6 }}>Token Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Cron Job, Backup Access, Manual Test"
              style={inputStyle} />
          </div>
          <button type="submit"
            style={{ background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 100, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Generate
          </button>
        </div>

        {newToken && (
          <div style={{ marginTop: 20, background: 'rgba(0,200,100,0.06)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.8rem', color: '#00c864', marginBottom: 8, fontWeight: 600 }}>
              ✓ Token created for "{newTokenLabel}" — copy it now, won't be shown again
            </div>
            <code style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.82rem', color: '#fff', wordBreak: 'break-all', background: 'var(--pulse-dark)', padding: 12, borderRadius: 6 }}>
              {newToken}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(newToken!); toast({ title: 'Copied!' }); }} type="button"
              style={{ marginTop: 10, fontSize: '0.78rem', color: '#00c864', background: 'none', border: '1px solid rgba(0,200,100,0.3)', padding: '5px 14px', borderRadius: 100, cursor: 'pointer' }}>
              Copy to clipboard
            </button>
          </div>
        )}
      </form>
    </AdminLayout>
  );
}
