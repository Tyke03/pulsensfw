const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(value: Date): string {
  return DATE.format(value);
}

export function articleHref(slug: string): string {
  return `/story/${slug}`;
}
