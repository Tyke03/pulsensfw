import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';

const CATEGORIES = [
  { slug: 'ai-chatbots',    label: 'AI Chatbots',    icon: '🤖', color: '#4fa3a8' },
  { slug: 'sex-tech',       label: 'Sex Tech',        icon: '💠', color: '#a87c4f' },
  { slug: 'vr',             label: 'VR & Immersive',  icon: '👓', color: '#7c4fa8' },
  { slug: 'industry-news',  label: 'Industry News',   icon: '📰', color: '#a84f4f' },
  { slug: 'how-to',         label: 'How-To',          icon: '📚', color: '#4fa860' },
  { slug: 'rankings',       label: 'Rankings',        icon: '⚡', color: '#a8a04f' },
];

function ItemCard({ item }: { item: any }) {
  const [open, setOpen] = useState(false);
  const statusColor = item.status === 'unused' ? '#00c864' : item.status === 'used' ? '#888' : '#a8a04f';
  const statusBg = item.status === 'unused' ? 'rgba(0,200,100,0.1)' : item.status === 'used' ? 'rgba(120,120,120,0.1)' : 'rgba(168,160,79,0.1)';

  return (
    <div style={{ background: '#111', border: '1px solid var(--pulse-border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, color: '#aaa' }}>{item.id}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, background: statusBg, color: statusColor, borderRadius: 100, padding: '1px 8px' }}>
              {item.status}
            </span>
            {item.article && (
              <span style={{ fontSize: '0.7rem', color: '#4fa3a8', fontFamily: 'monospace' }}>→ {item.article}</span>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#999', fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
            {open ? item.preview : (item.preview?.substring(0, 120) + (item.preview?.length > 120 ? '…' : ''))}
          </div>
        </div>
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px', flexShrink: 0 }}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}

function CategoryCard({ cat }: { cat: typeof CATEGORIES[0] }) {
  const [expanded, setExpanded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [`/api/research/${cat.slug}`],
    queryFn: () => fetch(`/api/research/${cat.slug}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
    refetchInterval: 120_000,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: [`/api/research/${cat.slug}/items`],
    queryFn: () => fetch(`/api/research/${cat.slug}/items`, { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn() && expanded,
  });

  const meta = data?.data;
  const items: any[] = itemsData?.data || [];

  async function triggerRun() {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const resp = await fetch(`/api/research/${cat.slug}/trigger`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await resp.json();
      setTriggerMsg(json.data?.message || 'Queued');
    } catch (e) {
      setTriggerMsg('Request failed — check API');
    } finally {
      setTriggering(false);
    }
  }

  const unusedPct = meta && meta.totalItems > 0
    ? Math.round((meta.unusedItems / meta.totalItems) * 100)
    : 0;

  return (
    <div style={{ background: 'var(--pulse-card)', border: `1px solid ${expanded ? cat.color + '55' : 'var(--pulse-border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
        data-testid={`research-card-${cat.slug}`}
      >
        <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{cat.label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)', marginTop: 2, fontFamily: 'monospace' }}>{cat.slug}</div>
        </div>

        {isLoading ? (
          <div style={{ color: '#555', fontSize: '0.8rem' }}>…</div>
        ) : meta ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* Stat chips */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00c864', fontFamily: "'Space Grotesk', sans-serif" }}>{meta.unusedItems}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--pulse-muted)', textTransform: 'uppercase' }}>Unused</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#888', fontFamily: "'Space Grotesk', sans-serif" }}>{meta.usedItems}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--pulse-muted)', textTransform: 'uppercase' }}>Used</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: cat.color, fontFamily: "'Space Grotesk', sans-serif" }}>{meta.totalItems}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--pulse-muted)', textTransform: 'uppercase' }}>Total</div>
            </div>
            {/* Progress bar */}
            <div style={{ width: 60 }}>
              <div style={{ height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${unusedPct}%`, background: cat.color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--pulse-muted)', marginTop: 3 }}>{unusedPct}% unused</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.78rem', color: '#555' }}>No data</div>
        )}

        <div style={{ color: '#555', fontSize: '0.75rem', marginLeft: 8 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Last updated + trigger */}
      {meta && (
        <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--pulse-border)' }}>
          <div style={{ fontSize: '0.75rem', color: '#555', paddingTop: 10 }}>
            {meta.lastUpdated
              ? `Last updated: ${new Date(meta.lastUpdated).toLocaleString()}`
              : 'File not yet updated by research agent'}
          </div>
          <div style={{ paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            {triggerMsg && <span style={{ fontSize: '0.72rem', color: '#4fa3a8', maxWidth: 300 }}>{triggerMsg}</span>}
            <button
              onClick={(e) => { e.stopPropagation(); triggerRun(); }}
              disabled={triggering}
              style={{ background: 'rgba(79,163,168,0.12)', color: '#4fa3a8', border: '1px solid rgba(79,163,168,0.3)', borderRadius: 8, padding: '5px 14px', fontSize: '0.75rem', cursor: 'pointer', opacity: triggering ? 0.6 : 1 }}
              data-testid={`btn-trigger-${cat.slug}`}
            >
              {triggering ? 'Queuing…' : '▶ Trigger Run'}
            </button>
          </div>
        </div>
      )}

      {/* Expanded: items + session log */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--pulse-border)' }}>
          {/* Items */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Research Items</div>
            {itemsLoading ? (
              <div style={{ color: '#555', fontSize: '0.8rem' }}>Loading items…</div>
            ) : items.length === 0 ? (
              <div style={{ color: '#555', fontSize: '0.82rem', padding: '12px 0' }}>
                No items yet. Research agent has not run or produced items for this category.
              </div>
            ) : (
              <>
                {items.filter((i: any) => i.status === 'unused').map((item: any) => (
                  <ItemCard key={item.id} item={item} />
                ))}
                {items.filter((i: any) => i.status !== 'unused').length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: '#555', padding: '6px 0' }}>
                      Show {items.filter((i: any) => i.status !== 'unused').length} used items
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {items.filter((i: any) => i.status !== 'unused').map((item: any) => (
                        <ItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          {/* Recent session log */}
          {meta?.recentLog && meta.recentLog.length > 0 && (
            <div style={{ padding: '0 20px 16px', borderTop: '1px solid #1a1a1a' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '14px 0 10px' }}>
                Recent Session Log
              </div>
              {meta.recentLog.map((entry: string, i: number) => (
                <pre key={i} style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6a6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0a0a0a', borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                  {entry.trim()}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminResearch() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auth.isLoggedIn()) navigate('/admin');
  }, []);

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Research Monitor</h1>
          <p style={{ color: 'var(--pulse-muted)', fontSize: '0.9rem', marginTop: 4 }}>
            6 category research files — raw data collected by research agents for writers to consume
          </p>
        </div>
        <button
          onClick={() => {
            CATEGORIES.forEach(cat => {
              queryClient.invalidateQueries({ queryKey: [`/api/research/${cat.slug}`] });
            });
          }}
          style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', color: 'var(--pulse-muted)', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', cursor: 'pointer' }}
          data-testid="btn-refresh-research"
        >
          ↻ Refresh All
        </button>
      </div>

      <div style={{ background: 'rgba(79,163,168,0.06)', border: '1px solid rgba(79,163,168,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: '0.82rem', color: '#4fa3a8' }}>
        <strong>How this works:</strong> Research agents run 5×/day and append items to each category file.
        Writer agents read from these files — they don't do their own web searches.
        If a category has 0 unused items when the writer fires, it files a Research Gap Report instead of an article.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CATEGORIES.map(cat => (
          <CategoryCard key={cat.slug} cat={cat} />
        ))}
      </div>

      <div style={{ fontSize: '0.75rem', color: '#333', marginTop: 16 }}>
        Item counts are read from the research files on disk. Files persist as long as the Render instance is running.
        A service restart or redeploy will reset counts until research agents run again — unless a persistent disk is mounted.
      </div>
    </AdminLayout>
  );
}
