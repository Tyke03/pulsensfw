import { apiRequest } from './queryClient';
import { authHeaders } from './auth';

export const CATEGORIES = [
  { slug: 'ai-chatbots', name: 'AI Chatbots', icon: '🤖' },
  { slug: 'sex-tech', name: 'Sex Tech', icon: '💠' },
  { slug: 'vr', name: 'VR & Immersive', icon: '👓' },
  { slug: 'industry-news', name: 'Industry News', icon: '📰' },
  { slug: 'how-to', name: 'How-To & Educational', icon: '📚' },
  { slug: 'rankings', name: 'Rankings & Lists', icon: '⚡' },
];

export function getCategoryName(slug: string) {
  return CATEGORIES.find(c => c.slug === slug)?.name || slug;
}
export function getCategoryIcon(slug: string) {
  return CATEGORIES.find(c => c.slug === slug)?.icon || '';
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Admin API helpers
export async function adminFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'API error');
  return data;
}
