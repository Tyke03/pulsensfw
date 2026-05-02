import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from '../components/AdminLayout';
import { auth, authHeaders } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';

export default function AdminAnalytics() {
  const [, navigate] = useLocation();
  useEffect(() => { if (!auth.isLoggedIn()) navigate('/admin'); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/analytics'],
    queryFn: () => fetch('/api/admin/analytics', { headers: authHeaders() }).then(r => r.json()),
    enabled: auth.isLoggedIn(),
  });

  const analytics = data?.data || {};

  return (
    <AdminLayout>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#fff', marginBottom: 24 }}>Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 40 }}>
        <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--pulse-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Total Pageviews</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--pulse-red)', fontFamily: "'Space Grotesk', sans-serif" }}>{isLoading ? '…' : (analytics.total_pageviews || 0).toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', color: '#fff', marginBottom: 16 }}>Top Pages</h2>
          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
            {(analytics.top_pages || []).length === 0 ? (
              <div style={{ padding: 24, color: 'var(--pulse-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No data yet</div>
            ) : (analytics.top_pages || []).map((page: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--pulse-border)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--pulse-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{page.path}</span>
                <span style={{ color: 'var(--pulse-red)', fontWeight: 600 }}>{page.views}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', color: '#fff', marginBottom: 16 }}>Top Referrers</h2>
          <div style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 12, overflow: 'hidden' }}>
            {(analytics.top_referrers || []).length === 0 ? (
              <div style={{ padding: 24, color: 'var(--pulse-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No referrer data yet</div>
            ) : (analytics.top_referrers || []).map((ref: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--pulse-border)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--pulse-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{ref.referrer || 'Direct'}</span>
                <span style={{ color: '#4fa3a8', fontWeight: 600 }}>{ref.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
