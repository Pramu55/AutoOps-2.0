import type { AuthSession, AuthTokens } from '@autoops/types';

export const ACCESS_TOKEN_KEY = 'autoops.accessToken';
export const REFRESH_TOKEN_KEY = 'autoops.refreshToken';
export const USER_KEY = 'autoops.user';
export const ORGANIZATIONS_KEY = 'autoops.organizations';
export const ZUSTAND_AUTH_KEY = 'autoops-auth';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ].join('; ');
}

export function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function setAuthSession(session: AuthSession): void {
  const { user, tokens, organizations } = session;

  clearAuthSession();
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  window.sessionStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(organizations));
  window.sessionStorage.setItem(
    ZUSTAND_AUTH_KEY,
    JSON.stringify({
      state: {
        user,
        accessToken: tokens.accessToken,
      },
      version: 0,
    }),
  );

  setCookie('refresh_token', tokens.refreshToken, 60 * 60 * 24 * 7);
  setCookie('autoops_session', '1', tokens.expiresIn);
}

export function updateAuthTokens(tokens: AuthTokens): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

  const persistedAuth = window.sessionStorage.getItem(ZUSTAND_AUTH_KEY);
  if (persistedAuth) {
    const parsed = JSON.parse(persistedAuth) as { state?: Record<string, unknown>; version?: number };
    window.sessionStorage.setItem(
      ZUSTAND_AUTH_KEY,
      JSON.stringify({
        ...parsed,
        state: {
          ...parsed.state,
          accessToken: tokens.accessToken,
        },
      }),
    );
  }

  setCookie('refresh_token', tokens.refreshToken, 60 * 60 * 24 * 7);
  setCookie('autoops_session', '1', tokens.expiresIn);
}

export function clearAuthSession(): void {
  if (typeof window !== 'undefined') {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith('autoops')) {
          storage.removeItem(key);
        }
      }
    }
  }

  clearCookie('refresh_token');
  clearCookie('autoops_session');
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;

  const from = window.location.pathname;
  const loginUrl = new URL('/login', window.location.origin);
  if (from && from !== '/' && from.startsWith('/') && !from.startsWith('//')) {
    loginUrl.searchParams.set('from', from);
  }

  window.location.assign(loginUrl.toString());
}

export async function refreshAccessToken(): Promise<AuthTokens> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }

  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Session expired. Please sign in again.');
  }

  const body = (await response.json()) as { data: AuthTokens };
  updateAuthTokens(body.data);
  return body.data;
}
