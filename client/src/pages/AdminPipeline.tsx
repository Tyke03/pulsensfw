import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';

const TYPE_COLORS: Record<string, string> = {
  research: '#4fa3a8',
  writer: '#a87c4f',
  qc: '#a84fa3',
  affiliate: '#4fa860',
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ok: { bg: 'rgba(0,200,100,0.12)', color: '#00c864', label: 'OK' },
  alert: { bg: 'rgba(255,60,60,0.15)', color: '#ff3c3c', label: 'ALERT' },
  never_run: { bg: 'rgba(120,120,120,0.15)', color: '#888', label: 'NEVER RUN' },
};

function AgentRow({ agent, expanded, onToggle }: { agent: any; expanded: boolean; onToggle: () => void }) {
  const s = STATUS_STYLES[agent.status] || STATUS_STYLES.never_run;
  const typeColor = TYPE_COLORS[agent.type] || '#888';

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--pulse-border)' }}
        data-testid={`agent-row-${agent.name}`}
      >
        <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#fff' }}>{agent.name}</td>
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: typeColor, background: `${typeColor}18`, borderRadius: 100, padding: '2px 9px' }}>
            {agent.type}
          </span>
        </td>
        <td style={{ padding: '13px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>
          {agent.schedule.join(', ')} UTC
        </td>
        <td style={{ padding: '13px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>
          {agent.lastRun ? new Date(agent.lastRun).toLocaleString() : <span style={{ color: '#555' }}>—</span>}
        </td>
        <td style={{ padding: '13px 16px', fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>
          {new Date(agent.nextRun).toLocaleString()}
        </td>
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color, borderRadius: 100, padding: '3px 10px' }}>
            {s.label}
          </span>
        </td>
        <td style={{ padding: '13px 16px', color: '#555', fontSize: '0.75rem' }}>
          {agent.recentLogs.length > 0 ? `▼ ${agent.recentLogs.length} log entries` : ''}
        </td>
      </tr>
      {expanded && agent.recentLogs.length > 0 && (
        <tr>
          <td colSpan={7} style={{ background: '#0d0d0d', borderBottom: '1px solid var(--pulse-border)' }}>
            <div style={{ padding: '16px 20px' }}>
              {agent.recentLogs.map((log: string, i: number) => (
                <pre key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#9a9', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 12px', borderLeft: '3px solid #333', paddingLeft: 12 }}>
                  {log.trim()}
                </pre>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPipeline() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn()) navigate('/admin');
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/pipeline/status'],
    queryFn: () => fetch('/api/pipeline/status', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
    refetchInterval: 60_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['/api/pipeline/alerts'],
    queryFn: () => fetch('/api/pipeline/alerts', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
    refetchInterval: 60_000,
  });

  const agents: any[] = data?.data?.agents || [];
  const alertCount: number = data?.data?.alertCount || 0;
  const alerts: any[] = alertsData?.data?.alerts || [];

  const researchers = agents.filter((a: any) => a.type === 'research');
  const writers = agents.filter((a: any) => a.type === 'writer');
  const qc = agents.filter((a: any) => a.type === 'qc');
  const affiliate = agents.filter((a: any) => a.type === 'affiliate');

  function Section({ title, rows, color }: { title: string; rows: any[]; color: string }) {
    return (
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--pulse-muted)' }}>({rows.length} agents)</span>
        </div>
        <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--pulse-border)' }}>
                {['Agent', 'Type', 'Schedule (UTC)', 'Last Run', 'Next Run', 'Status', 'Logs'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--pulse-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((agent: any) => (
                <AgentRow
                  key={agent.name}
                  agent={agent}
                  expanded={expandedAgent === agent.name}
                  onToggle={() => setExpandedAgent(expandedAgent === agent.name ? null : agent.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>Pipeline Status</h1>
          <p style={{ color: 'var(--pulse-muted)', fontSize: '0.9rem', marginTop: 4 }}>14 agents — research × 6, writer × 6, QC × 1, affiliate × 1</p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/pipeline/status'] })}
          style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', color: 'var(--pulse-muted)', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', cursor: 'pointer' }}
          data-testid="btn-refresh-pipeline"
        >
          ↻ Refresh
        </button>
      </div>

      {/* System Alerts Banner */}
      {alertCount > 0 && (
        <div style={{ background: 'rgba(255,40,40,0.08)', border: '1px solid rgba(255,40,40,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: alerts.length > 0 ? 12 : 0 }}>
            <span style={{ fontSize: '1.1rem' }}>⚠</span>
            <span style={{ fontWeight: 700, color: '#ff3c3c', fontFamily: "'Space Grotesk', sans-serif" }}>
              {alertCount} SYSTEM ALERT{alertCount !== 1 ? 'S' : ''} — Review Required
            </span>
          </div>
          {alerts.slice(0, 5).map((alert: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 12, fontSize: '0.82rem', color: '#ffaaaa', padding: '6px 0', borderTop: '1px solid rgba(255,40,40,0.15)' }}>
              <span style={{ color: '#ff6666', fontFamily: 'monospace', minWidth: 140 }}>{alert.agent}</span>
              <span>{alert.message}</span>
            </div>
          ))}
          {alerts.length > 5 && (
            <div style={{ fontSize: '0.78rem', color: '#ff6666', marginTop: 8 }}>+{alerts.length - 5} more alerts — check individual agent logs</div>
          )}
        </div>
      )}

      {alertCount === 0 && !isLoading && (
        <div style={{ background: 'rgba(0,200,100,0.06)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 12, padding: '12px 20px', marginBottom: 28, fontSize: '0.85rem', color: '#00c864' }}>
          ✓ No system alerts — pipeline is healthy
        </div>
      )}

      {isLoading && (
        <div style={{ color: 'var(--pulse-muted)', padding: '40px 0', textAlign: 'center' }}>Loading pipeline status...</div>
      )}

      {error && (
        <div style={{ background: 'rgba(255,40,40,0.08)', border: '1px solid rgba(255,40,40,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 28, color: '#ff6666', fontSize: '0.85rem' }}>
          Failed to load pipeline status. Check that the API is reachable.
        </div>
      )}

      {!isLoading && agents.length > 0 && (
        <>
          <Section title="Research Agents" rows={researchers} color="#4fa3a8" />
          <Section title="Writer Agents" rows={writers} color="#a87c4f" />
          <Section title="QC Agent" rows={qc} color="#a84fa3" />
          <Section title="Affiliate Agent" rows={affiliate} color="#4fa860" />
        </>
      )}

      <div style={{ fontSize: '0.75rem', color: '#444', marginTop: 8 }}>
        Schedule times are UTC. "Next Run" is calculated from hardcoded schedule — not live from Render. Auto-refreshes every 60s.
      </div>
    </AdminLayout>
  );
}
