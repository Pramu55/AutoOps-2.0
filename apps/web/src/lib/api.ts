/**
 * Thin fetch wrapper for the AutoOps API.
 * All requests go through Next.js rewrites: /api/* → API container.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText } }))) as ApiErrorBody;
    throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string, init?: RequestInit) => request<T>(path, { method: 'GET', ...init }),
  post:   <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'POST',   body: JSON.stringify(body), ...init }),
  put:    <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PUT',    body: JSON.stringify(body), ...init }),
  patch:  <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PATCH',  body: JSON.stringify(body), ...init }),
  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: 'DELETE', ...init }),
} as const;
