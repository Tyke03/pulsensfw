import type { APIRoute } from 'astro';
import { getContentRepository } from '../lib/content/local-repository';
import { RAIL_IDS } from '../lib/content/types';
import { entityHref } from '../lib/content/entities';

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('https://pulsensfw.com');
  const repo = getContentRepository();
  const articles = await repo.listArticles();
  const topics = await repo.listTopics();
  const catalog = await repo.listCatalog();
  const paths = [
    '/',
    '/hubs',
    '/search',
    '/deals',
    '/about',
    '/editorial-policy',
    '/how-we-review',
    '/affiliate-disclosure',
    '/contact',
    ...topics.map((topic) => topic.href),
    ...RAIL_IDS.map((rail) => `/desk/${rail}`),
    ...articles.map((article) => `/story/${article.slug}`),
    ...catalog.entities.map((entity) => entityHref(entity.type, entity.slug)),
  ];
  const urls = paths.map((path) => `<url><loc>${new URL(path, origin).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
