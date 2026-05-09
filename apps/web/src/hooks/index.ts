import useSWR, { type SWRConfiguration } from "swr";
import { api } from "@/lib/api";
import type {
  ApiResponse,
  IncidentDto,
  ServiceDto,
  AlertDto,
  WorkflowDto,
} from "@autoops/shared";

// Central fetcher — all SWR hooks use this so caching keys are consistent
const fetcher = async <T>(path: string): Promise<T> => {
  const res = await api.get<T>(path);
  if (!res.data) throw new Error("No data");
  return res.data;
};

const paginatedFetcher = async <T>(path: string) => {
  const raw = await api.get<T[]>(path) as ApiResponse<T[]> & {
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  };
  return raw;
};

// ── Stats ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  incidents: { active: number };
  services: { total: number; operational: number; degraded: number; outage: number };
  alerts: { open: number };
  workflows: { active: number };
  recentIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    createdAt: string;
    service: { id: string; name: string };
  }>;
}

export function useStats(config?: SWRConfiguration) {
  return useSWR<DashboardStats>("/stats", fetcher, {
    refreshInterval: 30_000,
    ...config,
  });
}

// ── Incidents ────────────────────────────────────────────────────────────────

export function useIncidents(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  severity?: string;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize ?? 20));
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  const key = `/incidents?${qs.toString()}`;
  return useSWR(key, paginatedFetcher<IncidentDto>, { refreshInterval: 15_000 });
}

export function useIncident(id: string | null) {
  return useSWR<IncidentDto>(id ? `/incidents/${id}` : null, fetcher);
}

// ── Services ─────────────────────────────────────────────────────────────────

export function useServices(params?: { page?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.status) qs.set("status", params.status);
  const key = `/services?${qs.toString()}`;
  return useSWR(key, paginatedFetcher<ServiceDto>, { refreshInterval: 30_000 });
}

export function useService(id: string | null) {
  return useSWR<ServiceDto>(id ? `/services/${id}` : null, fetcher);
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export function useAlerts(params?: {
  page?: number;
  status?: string;
  severity?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  const key = `/alerts?${qs.toString()}`;
  return useSWR(key, paginatedFetcher<AlertDto>, { refreshInterval: 15_000 });
}

// ── Workflows ────────────────────────────────────────────────────────────────

export function useWorkflows(params?: { page?: number; isActive?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  const key = `/workflows?${qs.toString()}`;
  return useSWR(key, paginatedFetcher<WorkflowDto>, { refreshInterval: 60_000 });
}
