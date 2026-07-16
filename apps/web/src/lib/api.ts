/**
 * Thin fetch wrapper for the AutoOps API.
 * Browser requests go through Next.js rewrites: /api/* -> API container.
 */
import {
  clearAuthSession,
  getAccessToken,
  redirectToLogin,
  refreshAccessToken,
} from '@/lib/auth-session';

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

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({
    error: {
      code: 'UNKNOWN',
      message: res.statusText,
    },
  }))) as ApiErrorBody;

  return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
}

function shouldAttemptRefresh(path: string): boolean {
  return path !== '/v1/auth/refresh' && path !== '/v1/auth/login';
}

async function request<T>(path: string, options?: RequestInit, hasRetried = false): Promise<T> {
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = getAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    if (res.status === 401 && !hasRetried && shouldAttemptRefresh(path)) {
      try {
        const tokens = await refreshAccessToken();
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        return request<T>(path, { ...options, headers }, true);
      } catch {
        clearAuthSession();
        redirectToLogin();
        throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired. Please sign in again.');
      }
    }

    throw await parseErrorResponse(res);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const inFlightGets = new Map<string, Promise<unknown>>();

function getDedupeKey(path: string, init?: RequestInit): string | null {
  if (typeof window === 'undefined') return null;
  if (init?.signal || init?.body) return null;

  const headers = new Headers(init?.headers);
  const headerParts = Array.from(headers.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${path}|${headerParts}`;
}

function getWithDedupe<T>(path: string, init?: RequestInit): Promise<T> {
  const dedupeKey = getDedupeKey(path, init);
  if (!dedupeKey) {
    return request<T>(path, { method: 'GET', ...init });
  }

  const existing = inFlightGets.get(dedupeKey);
  if (existing) return existing as Promise<T>;

  const promise = request<T>(path, { method: 'GET', ...init }).finally(() => {
    inFlightGets.delete(dedupeKey);
  });
  inFlightGets.set(dedupeKey, promise);
  return promise;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => getWithDedupe<T>(path, init),

  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...init }),

  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body), ...init }),

  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...init }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: 'DELETE', ...init }),
} as const;
