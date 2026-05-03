/**
 * useDocumentHead — dynamically sets <title> and <meta> SEO tags for each page.
 * Since this is a client-side SPA, this handles the Googlebot / social-share case
 * as well as the visible browser tab title.
 *
 * For full SSR-based crawling, a prerender layer is the next step — but this
 * solves the admin-visible "blank fields" problem immediately.
 */

import { useEffect } from 'react';

interface HeadOptions {
  title?: string;
  description?: string;
  canonical?: string;
}

const SITE_NAME = 'PulseNSFW';
const BASE_URL  = 'https://pulsensfw.com';

export function useDocumentHead({ title, description, canonical }: HeadOptions) {
  useEffect(() => {
    // --- <title> ---
    if (title) {
      document.title = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    } else {
      document.title = `${SITE_NAME} — The NSFW Internet, Honestly Reviewed.`;
    }

    // --- <meta name="description"> ---
    setMeta('name', 'description', description || '');

    // --- Open Graph ---
    setMeta('property', 'og:title',       document.title);
    setMeta('property', 'og:description', description || '');
    setMeta('property', 'og:type',        'article');
    if (canonical) {
      setMeta('property', 'og:url', canonical.startsWith('http') ? canonical : `${BASE_URL}${canonical}`);
    }

    // --- Canonical link ---
    if (canonical) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical.startsWith('http') ? canonical : `${BASE_URL}${canonical}`;
    }

    // Cleanup: reset to default when component unmounts
    return () => {
      document.title = `${SITE_NAME} — The NSFW Internet, Honestly Reviewed.`;
      setMeta('name', 'description', '');
    };
  }, [title, description, canonical]);
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}
