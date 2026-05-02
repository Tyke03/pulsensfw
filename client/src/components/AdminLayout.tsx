import { Link, useLocation } from 'wouter';
import { auth } from '../lib/auth';
import { PulseLogo } from './Layout';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/admin/posts', label: 'Posts', icon: '✦' },
  { href: '/admin/affiliates', label: 'Affiliates', icon: '🔗' },
  { href: '/admin/tokens', label: 'API Tokens', icon: '🔑' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  function logout() {
    auth.clear();
    navigate('/admin');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--pulse-dark)' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--pulse-card)', borderRight: '1px solid var(--pulse-border)', padding: '24px 0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '0 24px 24px', borderBottom: '1px solid var(--pulse-border)' }}>
          <PulseLogo size="sm" />
          <div style={{ fontSize: '0.7rem', color: 'var(--pulse-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>Admin</div>
        </div>
        <nav style={{ padding: '16px 0', flex: 1 }}>
          {NAV.map(item => (
            <Link key={item.href} href={item.href}>
              <a className={`admin-nav-item${location === item.href ? ' active' : ''}`} data-testid={`nav-${item.label.toLowerCase()}`}>
                <span style={{ marginRight: 10, fontSize: '0.9rem' }}>{item.icon}</span>
                {item.label}
              </a>
            </Link>
          ))}
        </nav>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--pulse-border)' }}>
          <Link href="/"><a style={{ display: 'block', fontSize: '0.8rem', color: 'var(--pulse-muted)', marginBottom: 8 }}>← View Site</a></Link>
          <button onClick={logout} style={{ fontSize: '0.8rem', color: 'var(--pulse-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-testid="btn-logout">
            Log out
          </button>
        </div>
      </aside>
      {/* Main */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
