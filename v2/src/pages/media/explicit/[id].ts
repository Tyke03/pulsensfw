import type { APIRoute } from 'astro';
import { explicitSvg } from '../../../lib/content/resolve-media';
import { explicitCatalog } from '../../../lib/media/explicit-catalog';
import { readReader } from '../../../lib/reader/cookies';

export const GET: APIRoute = ({ params, cookies, request }) => {
  const secure = new URL(request.url).protocol === 'https:';
  const reader = readReader(cookies, secure);
  const id = params.id ?? '';
  const spec = explicitCatalog[id];
  if (!reader.nsfw || !spec) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex',
      },
    });
  }
  return new Response(explicitSvg(id, spec.topic, spec.plate), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, no-store',
      'vary': 'cookie',
      'x-robots-tag': 'noindex',
      'x-content-type-options': 'nosniff',
    },
  });
};
