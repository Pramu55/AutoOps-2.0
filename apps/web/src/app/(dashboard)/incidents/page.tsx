"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useIncidents, useServices } from "@/hooks/index";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { IncidentModal } from "@/components/incidents/IncidentModal";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { IncidentDto } from "@autoops/shared";

export default function IncidentsPage() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IncidentDto | null>(null);

  const { data, isLoading } = useIncidents({ page, pageSize: 20, status, severity });
  const { data: servicesData } = useServices();

  const incidents = data?.data ?? [];
  const pagination = (data as { pagination?: { page: number; pageSize: number; total: number; totalPages: number } })?.pagination;
  const services = servicesData?.data ?? [];

  async function handleDelete(id: string) {
    if (!confirm("Delete this incident?")) return;
    try {
      await api.delete(`/incidents/${id}`);
      toast("Incident deleted", "success");
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/incidents"), undefined, { revalidate: true });
      await mutate("/stats", undefined, { revalidate: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  function openCreate() { setEditTarget(null); setModalOpen(true); }
  function openEdit(i: IncidentDto) { setEditTarget(i); setModalOpen(true); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidents</h1>
          <p className="text-gray-400 mt-1">Track and manage operational incidents</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Create
        </button>
      </div>

      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2d3a] flex items-center gap-3">
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Severities</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            {["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : incidents.length === 0 ? (
          <EmptyState
            title="No incidents found"
            description="Create one to start tracking"
            action={
              <button onClick={openCreate} className="text-sm text-blue-400 hover:text-blue-300">
                Create Incident
              </button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-[#2a2d3a]">
                {["Incident", "Severity", "Status", "Service", "Created", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d3a]">
              {incidents.map((i) => (
                <tr key={i.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm text-white font-medium max-w-xs truncate">{i.title}</td>
                  <td className="px-6 py-4"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-6 py-4"><StatusBadge status={i.status} /></td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {(i as IncidentDto & { service?: { name: string } }).service?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(i.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEdit(i)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(i.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <IncidentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        incident={editTarget}
        services={services}
      />
    </div>
  );
}
