const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1';

export type ApiError = { code: string; message: string; details?: Record<string, string[]> | null };

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public error: ApiError,
  ) {
    super(error.message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiFailure(res.status, body?.error ?? { code: 'NETWORK', message: 'Ralat rangkaian.' });
  }
  return (body?.data ?? null) as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiPut = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
