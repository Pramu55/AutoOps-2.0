// All auth calls go through Next.js Route Handlers (same-origin, server-side proxy).
// This means the browser never needs to reach the backend API URL directly —
// it calls /api/auth/... on the Next.js server, which calls the backend internally.
// This works regardless of where the user's browser is accessing the app from.
const AUTH_BASE = "";  // relative — always same origin as the Next.js app

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

const API_PREFIX = "/api/v1";

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
};

class FetchError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(`${status}: ${message}`);
    this.name = "FetchError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${API_PREFIX}${path}`;

  const res = await fetch(url, {
    credentials: "include", // send cookies with every request
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    throw new FetchError(
      res.status,
      json.message ?? json.error ?? `HTTP ${res.status}`
    );
  }

  return json;
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { method: "GET", ...options }),

  post: <T>(path: string, body: unknown, options?: RequestInit) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    }),

  patch: <T>(path: string, body: unknown, options?: RequestInit) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...options,
    }),

  delete: (path: string, options?: RequestInit) =>
    request(path, { method: "DELETE", ...options }),
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

// ── Auth via Next.js Route Handlers (server-side proxy, same-origin) ─────────

async function authFetch<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  // /api/auth/login, /api/auth/logout, /api/auth/me
  // These are Next.js Route Handlers — same origin as the web app.
  // The server-side handler then calls the backend API internally.
  const res = await fetch(`${AUTH_BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    throw new FetchError(res.status, json.message ?? json.error ?? `HTTP ${res.status}`);
  }

  return json;
}

export async function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  const res = await authFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.data) throw new Error("No data returned from login");
  return res.data;
}

export async function logoutRequest(): Promise<void> {
  await authFetch("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function getMeRequest(): Promise<AuthUser> {
  const res = await authFetch<AuthUser>("/api/auth/me");
  if (!res.data) throw new Error("No data returned from /auth/me");
  return res.data;
}
