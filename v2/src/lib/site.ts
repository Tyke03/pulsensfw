import type { RailId, SearchType, TopicId } from './content/types';

export const SITE = {
  name: 'PulseNSFW',
  discreetTitle: 'Notes',
  domain: 'pulsensfw.com',
  tagline: 'The NSFW internet, honestly reviewed.',
  description:
    'The NSFW internet, honestly reviewed. Stars, sites, AI, VR, games, and sex tech in one desk, with sources attached.',
} as const;

export const TOPIC_LABEL: Record<TopicId, string> = {
  stars: 'Stars & Creators',
  sites: 'Sites',
  ai: 'AI',
  toys: 'Toys & Tech',
  vr: 'VR & Games',
  guides: 'Guides',
  lists: 'Top Lists',
  news: 'News',
};

export const RAIL_META: Record<RailId, { title: string; href: string; lede: string }> = {
  trending: { title: 'Trending', href: '/desk/trending', lede: 'What people are opening first tonight.' },
  latest: { title: 'Latest', href: '/desk/latest', lede: 'New releases, new scenes, new gear.' },
  editors: { title: "Editor's picks", href: '/desk/editors', lede: 'The desk would send a friend these.' },
  guides: { title: 'New guides', href: '/guides', lede: 'Setup, fit, and how to tell a good night from a bad one.' },
  top10: { title: 'Top lists', href: '/lists', lede: 'Ranked for viewers. Every row has its own picture.' },
};

export const SEARCH_FILTERS: Array<{ id: SearchType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'star', label: 'Stars' },
  { id: 'site', label: 'Sites' },
  { id: 'ai', label: 'AI' },
  { id: 'product', label: 'Toys' },
  { id: 'game', label: 'Games' },
  { id: 'article', label: 'Stories' },
];

export const SOCIALS = [
  { label: 'Instagram', href: '' },
  { label: 'X', href: '' },
  { label: 'YouTube', href: '' },
  { label: 'TikTok', href: '' },
] as const;

export const NOTICES: Record<string, string> = {
  'nsfw-on': 'NSFW mode is on for this browser. Explicit images can load.',
  'nsfw-off': 'Back to SFW. Explicit image URLs are not on this page.',
  'nsfw-locked': 'Verify age before NSFW mode can turn on.',
  'discreet-on': 'Discreet mode is on. The tab title and icon are neutral.',
  'discreet-off': 'Discreet mode is off.',
  'blur-on': 'Blur is on. The header stays clear so you can turn it off.',
  'blur-off': 'Blur is off.',
  'prefs-saved': 'Reader settings saved on this browser.',
  'age-failed': 'Check the age confirmation and try again.',
  'age-vendor-failed': 'The age service did not pass the check. Try again later.',
  'auth-link-sent': 'Check your inbox — the sign-in link is on its way.',
  'auth-invalid': 'That email does not look sendable. Try again.',
  'auth-failed': 'The sign-in did not go through. The link may have been used already.',
  'auth-in': 'Signed in. Saved pages and follows live with the account now.',
  'auth-out': 'Signed out. The age gate and reader switches stay on this browser.',
  'auth-unconfigured': 'Accounts are not configured on this deployment yet.',
  'save-guest': 'Sign in first — saves live with the account.',
  'save-invalid': 'That save request was not valid.',
  'saved-on': 'Saved to your desk.',
  'saved-off': 'Removed from your saved list.',
  'follow-guest': 'Sign in first — follows live with the account.',
  'follow-invalid': 'That follow request was not valid.',
  'followed-on': 'Following. Updates land at /you.',
  'followed-off': 'Unfollowed.',
  'news-sent': 'Check your inbox for the confirmation email.',
  'news-invalid': 'That email does not look sendable. Try again.',
  'news-unconfigured': 'The list is not connected yet — no email was sent.',
  'news-error': 'The email service did not answer. Nothing was faked — try again.',
  'contact-unconfigured': 'Nothing was sent. Email delivery is not connected yet.',
  'contact-invalid': 'Add a name, a real email, and a message.',
  'contact-sent': 'The note reached the desk. Reply comes by email.',
};

export function noticeCopy(code: string | null): string | null {
  if (!code) return null;
  return NOTICES[code] ?? null;
}
