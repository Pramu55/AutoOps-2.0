"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useAlerts } from "@/hooks/index";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

export default function AlertsPage() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [severityFilter, setSeverityFilter] = useState("");

  const { data, isLoading } = useAlerts({ page, status: statusFilter || undefined, severity: severityFilter || undefined });
  const alerts = data?.data ?? [];
  const pagination = data?.pagination;

  async function action(id: string, type: "acknowledge" | "resolve") {
    try {
      await api.post(`/alerts/${id}/${type}`, {});
      toast(`Alert ${type === "acknowledge" ? "acknowledged" : "resolved"}`, "success");
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/alerts"), undefined, { revalidate: true });
      await mutate("/stats", undefined, { revalidate: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-gray-400 mt-1">Monitor and respond to operational alerts</p>
        </div>
      </div>

      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2d3a] flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            {["ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Severities</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : alerts.length === 0 ? (
          <EmptyState title="No alerts" description="All clear — no alerts matching your filters" />
        ) : (
          <div className="divide-y divide-[#2a2d3a]">
            {alerts.map((a) => (
              <div key={a.id} className="px-6 py-4 flex items-start gap-4">
                <SeverityBadge severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{a.title}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">{a.message}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500">Source: {a.source}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                {a.status === "ACTIVE" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => action(a.id, "acknowledge")}
                      className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded transition-colors"
                    >
                      Ack
                    </button>
                    <button
                      onClick={() => action(a.id, "resolve")}
                      className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 px-2 py-1 rounded transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                )}
                {a.status === "ACKNOWLEDGED" && (
                  <button
                    onClick={() => action(a.id, "resolve")}
                    className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 px-2 py-1 rounded transition-colors shrink-0"
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {pagination && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
