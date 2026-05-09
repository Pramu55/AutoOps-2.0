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
    super(message);
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

export async function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", payload);
  if (!res.data) throw new Error("No data returned from login");
  return res.data;
}

export async function logoutRequest(): Promise<void> {
  await api.post("/auth/logout", {});
}

export async function getMeRequest(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me");
  if (!res.data) throw new Error("No data returned from /auth/me");
  return res.data;
}
