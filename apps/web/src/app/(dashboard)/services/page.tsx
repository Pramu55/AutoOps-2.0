"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useServices } from "@/hooks/index";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ServiceModal } from "@/components/services/ServiceModal";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { ServiceDto } from "@autoops/shared";

const STATUS_DOT: Record<string, string> = {
  OPERATIONAL: "bg-green-500",
  DEGRADED: "bg-yellow-500",
  OUTAGE: "bg-red-500",
  MAINTENANCE: "bg-blue-500",
};

export default function ServicesPage() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ServiceDto | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useServices({ status: statusFilter || undefined });
  const services = data?.data ?? [];


  async function handleDelete(s: ServiceDto) {
    if (!confirm(`Delete "${s.name}"?`)) return;
    try {
      await api.delete(`/services/${s.id}`);
      toast("Service deleted", "success");
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/services"), undefined, { revalidate: true });
      await mutate("/stats", undefined, { revalidate: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Services</h1>
          <p className="text-gray-400 mt-1">Monitor and manage your infrastructure services</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            {["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Add Service
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : services.length === 0 ? (
        <EmptyState title="No services found" description="Add a service to start monitoring" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((s) => (
            <div key={s.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6 hover:border-[#3a3d4a] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s.status] ?? "bg-gray-500"}`} />
                  <h3 className="font-semibold text-white">{s.name}</h3>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <p className="text-sm text-gray-400 mb-4 min-h-[1.25rem]">
                {s.description ?? <span className="text-gray-600 italic">No description</span>}
              </p>
              {s.url && <p className="text-xs text-blue-400 mb-3 truncate">{s.url}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-[#2a2d3a]">
                <span className="text-xs text-gray-500">
                  {s._count?.incidents ?? 0} active incidents
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setEditTarget(s); setModalOpen(true); }} className="text-xs text-gray-400 hover:text-white transition-colors">Edit</button>
                  <button onClick={() => handleDelete(s)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ServiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        service={editTarget}
      />
    </div>
  );
}
