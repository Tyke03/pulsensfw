import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { getCategoryName } from '../lib/api';

function StatCard({ label, value, sub, color = 'var(--pulse-red)' }: any) {
  return (
    <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '20px', minWidth: 0 }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 'clamp(1.6rem, 2.2vw, 2.2rem)', fontWeight: 700, color, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: 'var(--pulse-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const LIVE_STATE_LABELS: Record<string, string> = {
  discovered: 'Discovered',
  research_validated: 'Research validated',
  ready_to_write: 'Ready to write',
  claimed: 'Claimed',
  in_progress: 'In progress',
  draft_proposed: 'Draft proposed',
  draft_persisted: 'Draft persisted',
  visual_pending: 'Visual pending',
  needs_visual: 'Needs visual',
  visual_ready: 'Visual ready',
  end_rail_pending: 'End-rail pending',
  end_rail_validated: 'End-rail validated',
  qc_pending: 'QC pending',
};

const DEAD_STATE_LABELS: Record<string, string> = {
  human_review: 'Human review',
  retryable_failure: 'Retryable failure',
  terminal_failure: 'Terminal failure',
};

const REASON_LABELS: Record<string, string> = {
  human_review_required: 'Model refusal / escalation',
  max_attempts_exhausted: 'Retries exhausted',
  category_routing_mismatch: 'Category routing mismatch',
  unroutable_category: 'Unroutable category',
  qc_hold: 'QC held draft',
};

function ReviewRow({ item, onResolve }: { item: any; onResolve: (id: number, action: string, notes: string) => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);
  const reason = REASON_LABELS[item.reasonCode] || item.reasonCode;
  const detail = (() => {
    try {
      const d = typeof item.detail === 'string' ? JSON.parse(item.detail) : item.detail;
      return JSON.stringify(d, null, 2);
    } catch { return String(item.detail ?? ''); }
  })();

  async function act(action: string) {
    setBusy(action);
    try { await onResolve(item.id, action, notes); } finally { setBusy(''); }
  }

  const btn = (action: string, label: string, bg: string, color: string) => (
    <button
      disabled={!!busy}
      onClick={() => act(action)}
      data-testid={`review-${action}-${item.id}`}
      style={{ background: bg, color, border: '1px solid' + color + '44', borderRadius: 100, padding: '5px 14px', fontSize: '0.75rem', cursor: busy ? 'wait' : 'pointer', fontWeight: 600 }}
    >
      {busy === action ? '…' : label}
    </button>
  );

  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--pulse-border)' }} data-testid={`review-row-${item.id}`}>
        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#fff' }}>#{item.workItemId ?? item.id}</td>
        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: 'var(--pulse-muted)' }}>{item.role || '—'}</td>
        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#ffcc66' }}>{reason}</td>
        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: 'var(--pulse-muted)' }}>{item.itemState || '—'}</td>
        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: 'var(--pulse-muted)' }}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: '#0d0d0d', borderBottom: '1px solid var(--pulse-border)' }}>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Escalation detail</div>
                <pre data-testid={`review-detail-${item.id}`} style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#9a9', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 200, overflowY: 'auto' }}>
                  {detail || '(none)'}
                </pre>
                {item.lastError && (
                  <>
                    <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 6px' }}>Last item error</div>
                    <pre style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#f99', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                      {typeof item.lastError === 'string' ? item.lastError : JSON.stringify(item.lastError, null, 2)}
                    </pre>
                  </>
                )}
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Resolution note (optional, recorded with your decision)"
                  data-testid={`review-notes-${item.id}`}
                  style={{ width: '100%', marginTop: 14, background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Resolve as</div>
                {btn('resume', '▶ Resume — send back to queue', 'rgba(0,200,100,0.12)', '#00c864')}
                {btn('kill', '✕ Kill — terminal failure', 'rgba(255,60,60,0.1)', '#ff3c3c')}
                {btn('archive', '📁 Archive — close without touching item', 'rgba(120,120,120,0.12)', '#888')}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminOverview() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn()) navigate('/admin');
  }, []);

  const { data: overviewData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/overview'],
    queryFn: () => fetch('/api/admin/overview', { headers: authHeaders() as Record<string, string> }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
    refetchInterval: 60_000,
  });

  const { data: reviewData } = useQuery({
    queryKey: ['/api/admin/review-queue'],
    queryFn: () => fetch('/api/admin/review-queue', { headers: authHeaders() as Record<string, string> }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
    refetchInterval: 60_000,
  });

  const o = overviewData?.data || {};
  const reviewItems: any[] = reviewData?.data?.items || [];
  const recentResolutions: any[] = reviewData?.data?.recent || [];

  async function resolveReview(id: number, action: string, notes: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/review-queue/${id}/resolve`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' } as Record<string, string>,
        body: JSON.stringify({ action, notes }),
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error || 'resolve failed');
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/review-queue'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
    } catch (e: any) {
      setActionError(e?.message || 'resolve failed');
    }
  }

  const pipeline = o.pipeline || { live: 0, byState: {}, dead: [] };
  const runs = o.runs || { total: 0, succeeded: 0, refusedOrEscalated: 0, totalSpendUsd: 0 };
  const deadRows: any[] = Array.isArray(pipeline.dead) ? pipeline.dead : [];
  const successRate = runs.total > 0 ? Math.round((runs.succeeded / runs.total) * 100) : null;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Operations Dashboard</h1>
          <p style={{ color: 'var(--pulse-muted)', fontSize: '0.9rem', marginTop: 4 }}>Live pipeline, publishing stats, and the human-review queue</p>
        </div>
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
            queryClient.invalidateQueries({ queryKey: ['/api/admin/review-queue'] });
          }}
          style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', color: 'var(--pulse-muted)', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', cursor: 'pointer' }}
          data-testid="btn-refresh-overview"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,40,40,0.08)', border: '1px solid rgba(255,40,40,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 28, color: '#ff6666', fontSize: '0.85rem' }}>
          Failed to load overview. Check the API is reachable.
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--pulse-muted)', padding: '40px 0', textAlign: 'center' }}>Loading operations data…</div>}

      {!isLoading && !error && (
        <>
          {/* ── Top stat row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
            <StatCard label="Published articles" value={o.posts?.published ?? '—'} sub={`${o.posts?.drafts ?? 0} drafts in DB`} color="#fff" />
            <StatCard label="In pipeline" value={pipeline.live} sub="Work items being processed" color="#4fa3a8" />
            <StatCard label="Needs your review" value={reviewItems.length} sub="Open human-review escalations" color={reviewItems.length > 0 ? '#ffcc66' : '#00c864'} />
            <StatCard label="Published (24h)" value={o.publishing?.last24h ?? '—'} sub={o.publishing?.lastPublish ? `Last: ${new Date(o.publishing.lastPublish).toLocaleString()}` : 'None yet'} color="#00c864" />
            <StatCard label="Model runs" value={runs.total} sub={successRate !== null ? `${successRate}% succeeded · $${runs.totalSpendUsd.toFixed(2)} spend` : undefined} color="#a87c4f" />
          </div>

          {/* ── Human review queue ── */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.05rem', color: '#fff', marginBottom: 12 }}>
              Human Review Queue {reviewItems.length > 0 && <span style={{ color: '#ffcc66' }}>({reviewItems.length} open)</span>}
            </h2>
            {actionError && (
              <div data-testid="review-action-error" style={{ background: 'rgba(255,40,40,0.08)', border: '1px solid rgba(255,40,40,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, color: '#ff6666', fontSize: '0.8rem' }}>
                {actionError}
              </div>
            )}
            {reviewItems.length === 0 ? (
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '20px', color: '#00c864', fontSize: '0.85rem' }}>
                ✓ Nothing waiting on you — the queue is clear.
              </div>
            ) : (
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                      {['Item', 'Agent role', 'Reason', 'Item state', 'Escalated at'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--pulse-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map(item => (
                      <ReviewRow key={item.id} item={item} onResolve={resolveReview} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: '#444', marginTop: 8 }}>
              Resume = reset attempts and send back to the pipeline queue · Kill = terminal failure, no retries · Archive = close the escalation, leave the item parked. Click a row for full detail.
            </div>
          </div>

          {/* ── Two-column: published by category + pipeline states ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 36 }}>
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.05rem', color: '#fff', marginBottom: 12 }}>Published by category</h2>
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '16px 20px' }}>
                {Object.keys(o.publishedByCategory || {}).length === 0 ? (
                  <div style={{ color: 'var(--pulse-muted)', fontSize: '0.82rem' }}>No published articles yet.</div>
                ) : (
                  Object.entries(o.publishedByCategory || {}).map(([cat, n]: any) => {
                    const total = Object.values(o.publishedByCategory).reduce((a: number, b: any) => a + b, 0);
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                        <div style={{ width: 170, fontSize: '0.82rem', color: '#fff', flexShrink: 0 }}>{getCategoryName(cat)}</div>
                        <div style={{ flex: 1, height: 8, background: 'var(--pulse-dark)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${total > 0 ? (n / total) * 100 : 0}%`, height: '100%', background: 'var(--pulse-red)', borderRadius: 4 }} />
                        </div>
                        <div style={{ width: 36, textAlign: 'right', fontSize: '0.82rem', color: 'var(--pulse-red)', fontWeight: 700 }}>{n}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.05rem', color: '#fff', marginBottom: 12 }}>Pipeline work items (live states)</h2>
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: '16px 20px' }}>
                {Object.keys(pipeline.byState || {}).length === 0 ? (
                  <div style={{ color: 'var(--pulse-muted)', fontSize: '0.82rem' }}>Pipeline is empty right now.</div>
                ) : (
                  Object.entries(pipeline.byState || {}).map(([state, n]: any) => (
                    <div key={state} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--pulse-muted)' }}>{LIVE_STATE_LABELS[state] || state}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{n}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ── Stuck / failed items ── */}
          {deadRows.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.05rem', color: '#fff', marginBottom: 12 }}>Stuck &amp; failed items</h2>
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                      {['State', 'Role', 'Count'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--pulse-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deadRows.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                        <td style={{ padding: '9px 16px', fontSize: '0.8rem', color: r.state === 'terminal_failure' ? '#ff6666' : '#ffcc66' }}>{DEAD_STATE_LABELS[r.state] || r.state}</td>
                        <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--pulse-muted)' }}>{r.role}</td>
                        <td style={{ padding: '9px 16px', fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Recent resolutions ── */}
          {recentResolutions.length > 0 && (
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.05rem', color: '#fff', marginBottom: 12 }}>Recently resolved reviews</h2>
              <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
                {recentResolutions.map((r: any, i: number) => (
                  <div key={r.id} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '9px 20px', fontSize: '0.78rem', borderBottom: i < recentResolutions.length - 1 ? '1px solid var(--pulse-border)' : 'none' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--pulse-red)', minWidth: 40 }}>#{r.workItemId ?? r.id}</span>
                    <span style={{ color: 'var(--pulse-muted)' }}>{REASON_LABELS[r.reasonCode] || r.reasonCode}</span>
                    <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.resolutionNotes || '(no note)'}</span>
                    <span style={{ color: '#555' }}>{r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
