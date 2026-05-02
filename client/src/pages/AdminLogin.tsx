import { useState } from 'react';
import { useLocation } from 'wouter';
import { auth } from '../lib/auth';
import { PulseLogo } from '../components/Layout';

export default function AdminLogin() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/health', {
        headers: { 'Authorization': `Bearer ${token.trim()}` }
      });
      const data = await res.json();
      if (data.success) {
        auth.setToken(token.trim());
        navigate('/admin/dashboard');
      } else {
        setError('Invalid token. Please check and try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pulse-dark)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <PulseLogo size="lg" />
          <p style={{ color: 'var(--pulse-muted)', marginTop: 8, fontSize: '0.9rem' }}>Admin Access</p>
        </div>
        <form onSubmit={handleLogin} style={{ background: 'var(--pulse-card)', border: '1px solid var(--pulse-border)', borderRadius: 16, padding: 32 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--pulse-muted)', marginBottom: 8 }}>Admin Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste your token here"
              required
              data-testid="input-token"
              style={{ width: '100%', padding: '12px 16px', background: 'var(--pulse-dark)', border: '1px solid var(--pulse-border)', borderRadius: 8, color: 'var(--pulse-light)', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>
          {error && <p style={{ color: '#ff6b8a', fontSize: '0.85rem', marginBottom: 16 }}>{error}</p>}
          <button type="submit" disabled={loading} data-testid="btn-login"
            style={{ width: '100%', background: 'var(--pulse-red)', color: '#fff', border: 'none', padding: '12px', borderRadius: 100, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Verifying…' : 'Enter Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
