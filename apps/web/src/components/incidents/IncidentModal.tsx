"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useSWRConfig } from "swr";
import type { IncidentDto, ServiceDto } from "@autoops/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  incident?: IncidentDto | null;
  services: ServiceDto[];
}

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;

export function IncidentModal({ open, onClose, incident, services }: Props) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "MEDIUM",
    serviceId: "",
    status: "OPEN",
  });

  useEffect(() => {
    if (incident) {
      setForm({
        title: incident.title,
        description: incident.description ?? "",
        severity: incident.severity,
        serviceId: incident.serviceId,
        status: incident.status,
      });
    } else {
      setForm({ title: "", description: "", severity: "MEDIUM", serviceId: services[0]?.id ?? "", status: "OPEN" });
    }
  }, [incident, services, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.serviceId) {
      toast("Title and service are required", "error");
      return;
    }
    setLoading(true);
    try {
      if (incident) {
        await api.patch(`/incidents/${incident.id}`, form);
        toast("Incident updated", "success");
      } else {
        await api.post("/incidents", form);
        toast("Incident created", "success");
      }
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/incidents"), undefined, { revalidate: true });
      await mutate("/stats", undefined, { revalidate: true });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  }

  const field = "w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500";

  return (
    <Modal open={open} onClose={onClose} title={incident ? "Edit Incident" : "Create Incident"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Title *</label>
          <input
            className={field}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Brief description of the incident"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <textarea
            className={`${field} resize-none h-20`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Detailed description (optional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Service *</label>
            <select
              className={field}
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              required
            >
              <option value="">Select service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Severity</label>
            <select className={field} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {incident && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading && <Spinner className="w-4 h-4" />}
            {incident ? "Save Changes" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
