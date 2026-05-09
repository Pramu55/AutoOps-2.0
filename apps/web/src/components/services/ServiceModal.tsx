"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useSWRConfig } from "swr";
import type { ServiceDto } from "@autoops/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  service?: ServiceDto | null;
}

const STATUSES = ["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"] as const;

export function ServiceModal({ open, onClose, service }: Props) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", status: "OPERATIONAL", url: "" });

  useEffect(() => {
    setForm(service
      ? { name: service.name, description: service.description ?? "", status: service.status, url: (service as ServiceDto & { url?: string }).url ?? "" }
      : { name: "", description: "", status: "OPERATIONAL", url: "" }
    );
  }, [service, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast("Name is required", "error"); return; }
    setLoading(true);
    try {
      if (service) {
        await api.patch(`/services/${service.id}`, form);
        toast("Service updated", "success");
      } else {
        await api.post("/services", form);
        toast("Service created", "success");
      }
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/services"), undefined, { revalidate: true });
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
    <Modal open={open} onClose={onClose} title={service ? "Edit Service" : "Add Service"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Service name" required />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">URL</label>
            <input className={field} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
            {loading && <Spinner className="w-4 h-4" />}
            {service ? "Save" : "Add Service"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
