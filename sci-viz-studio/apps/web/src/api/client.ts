export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

let tokenProvider: () => Promise<string | null> = async () => null;

export function setAuthTokenProvider(provider: () => Promise<string | null>) { tokenProvider = provider; }

export function notifyUsageChanged() { window.dispatchEvent(new Event('studio:usage-changed')); }

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await tokenProvider();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path.startsWith('http') ? path : `${API_BASE_URL}${path}`, { ...init, headers });
}
