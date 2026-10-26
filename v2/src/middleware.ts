import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-frame-options', 'SAMEORIGIN');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  const vary = response.headers.get('vary');
  response.headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie');
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/html') && !response.headers.has('cache-control')) {
    response.headers.set('cache-control', 'private, no-cache');
  }
  return response;
});
