export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    const fetchSite = request.headers.get('sec-fetch-site');
    return fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none';
  }
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
