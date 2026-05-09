"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useWorkflows } from "@/hooks/index";
import { PageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { WorkflowDto } from "@autoops/shared";

export default function WorkflowsPage() {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [triggering, setTriggering] = useState<string | null>(null);
  const { data, isLoading } = useWorkflows();

  const workflows = data?.data ?? [];

  async function triggerWorkflow(w: WorkflowDto) {
    setTriggering(w.id);
    try {
      await api.post(`/workflows/${w.id}/trigger`, { input: {} });
      toast(`"${w.name}" triggered`, "success");
      await mutate((key: unknown) => typeof key === "string" && key.startsWith("/workflows"), undefined, { revalidate: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Trigger failed", "error");
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Workflows</h1>
        <p className="text-gray-400 mt-1">Automate operations with workflow orchestration</p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : workflows.length === 0 ? (
        <EmptyState title="No workflows" description="No workflows configured yet" />
      ) : (
        <div className="space-y-4">
          {workflows.map((w) => {
            const ext = w as WorkflowDto & { _count?: { runs: number } };
            return (
              <div key={w.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white">{w.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${w.isActive ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-500"}`}>
                        {w.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{w.description ?? "No description"}</p>
                  </div>
                  {w.isActive && (
                    <button
                      onClick={() => triggerWorkflow(w)}
                      disabled={triggering === w.id}
                      className="ml-4 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {triggering === w.id ? "Triggering…" : "▶ Trigger"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-[#2a2d3a]">
                  <div>
                    <p className="text-xs text-gray-500">Total Runs</p>
                    <p className="text-sm font-medium text-white">{ext._count?.runs ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Version</p>
                    <p className="text-sm font-medium text-white">v{w.isActive ? "1" : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Updated</p>
                    <p className="text-sm font-medium text-white">
                      {new Date(w.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
