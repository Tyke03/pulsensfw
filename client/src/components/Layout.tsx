import { Link, useLocation } from 'wouter';
import { CATEGORIES } from '../lib/api';

export function PulseLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: '1.1rem', md: '1.4rem', lg: '1.8rem' };
  return (
    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: sizes[size], letterSpacing: '-0.5px', color: '#fff' }}>
      Pulse<span style={{ color: 'var(--pulse-red)' }}>NSFW</span>
    </span>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="pub-root">
      <div className="pub-container">
        <nav className="pub-nav">
          <Link href="/">
            <a style={{ textDecoration: 'none' }}><PulseLogo /></a>
          </Link>
          <div className="pub-nav-links">
            {CATEGORIES.slice(0, 6).map(c => (
              <Link key={c.slug} href={`/category/${c.slug}`}>
                <a className={location === `/category/${c.slug}` ? 'active' : ''}>{c.name}</a>
              </Link>
            ))}
          </div>
        </nav>
        <main>{children}</main>
        <footer className="pub-footer">
          <span>© 2026 PulseNSFW</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--pulse-muted)' }}>This site uses affiliate links — we earn a commission at no cost to you.</span>
          <Link href="/admin"><a style={{ color: 'var(--pulse-muted)', fontSize: '0.8rem' }}>Admin</a></Link>
        </footer>
      </div>
    </div>
  );
}

export function PostCard({ post }: { post: any }) {
  return (
    <Link href={`/post/${post.slug}`}>
      <a className="post-card" style={{ textDecoration: 'none' }} data-testid={`card-post-${post.id}`}>
        <div className="post-card-cat">{post.category}</div>
        <h3>{post.title}</h3>
        <p className="post-card-excerpt">{post.excerpt || ''}</p>
        <div className="post-card-meta">
          <span>{new Date(post.publishedAt || post.createdAt || post.published_at || post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <div className="post-card-tags">
            {(post.tags || []).slice(0, 2).map((t: string) => <span key={t}>{t}</span>)}
          </div>
        </div>
      </a>
    </Link>
  );
}
