import type { ApiResponse, PaginatedResponse } from "@autoops/shared";
import { API_PREFIX } from "@autoops/shared";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiResponse;
      throw new Error(error.message ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<ApiResponse<T>>;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path);
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> {
    await this.request(path, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient(API_BASE);
