const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBaseUrl(url: string): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
  return `${baseUrl}${url}`;
}

export const apiBaseUrl = `${baseUrl}/api`;
