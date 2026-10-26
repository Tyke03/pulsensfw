import type { RailId, TopicId } from './content/types';

export const SITE = {
  name: 'PulseNSFW',
  discreetTitle: 'Notes',
  domain: 'pulsensfw.com',
  tagline: "What's new in the NSFW internet.",
  description:
    'News, guides, reviews, rankings, and scene notes across AI companions, sex tech, VR, adult creators, and the wider NSFW web.',
} as const;

export const TOPIC_LABEL: Record<TopicId, string> = {
  vr: 'VR',
  toys: 'Toys',
  'ai-chat': 'AI Chat',
  creators: 'Creators',
  news: 'News',
  guides: 'Guides',
  deals: 'Deals',
};

export const RAIL_META: Record<RailId, { title: string; href: string; lede: string }> = {
  trending: { title: 'Trending', href: '/desk/trending', lede: 'What the desk is opening first tonight.' },
  latest: { title: 'Latest', href: '/desk/latest', lede: 'Fresh seed stories, newest first.' },
  editors: { title: "Editor's picks", href: '/desk/editors', lede: 'Pieces the desk would put on the front.' },
  guides: { title: 'New guides', href: '/guides', lede: 'Setup notes and lab method.' },
  top10: { title: 'Top 10s', href: '/desk/top10', lede: 'Ranked lists, still example copy.' },
};

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
  'contact-unconfigured': 'Nothing was sent. Email delivery is not connected yet.',
  'contact-invalid': 'Add a name, a real email, and a message.',
};

export function noticeCopy(code: string | null): string | null {
  if (!code) return null;
  return NOTICES[code] ?? null;
}
