import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { Severity, AlertStatus } from "@autoops/shared";

export const metadata: Metadata = { title: "Alerts | AutoOps" };

const alerts = [
  { id: "1", title: "High memory usage detected", message: "Worker service memory usage exceeded 85% threshold", severity: "HIGH" as Severity, status: "ACTIVE" as AlertStatus, source: "prometheus", createdAt: "2024-01-15T11:30:00Z" },
  { id: "2", title: "Slow database queries", message: "P99 query latency exceeded 500ms for the past 10 minutes", severity: "MEDIUM" as Severity, status: "ACKNOWLEDGED" as AlertStatus, source: "datadog", createdAt: "2024-01-15T10:45:00Z" },
  { id: "3", title: "Disk space warning", message: "API server disk usage at 78%", severity: "LOW" as Severity, status: "ACTIVE" as AlertStatus, source: "cloudwatch", createdAt: "2024-01-15T09:00:00Z" },
  { id: "4", title: "Network packet loss", message: "Packet loss rate exceeded 1% between services", severity: "CRITICAL" as Severity, status: "RESOLVED" as AlertStatus, source: "prometheus", createdAt: "2024-01-14T23:30:00Z" },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="text-gray-400 mt-1">Monitor and respond to operational alerts</p>
      </div>
      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2d3a] flex items-center gap-3">
          <input type="search" placeholder="Search alerts…" className="flex-1 bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <select className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500">
            <option>All Sources</option><option>Prometheus</option><option>Datadog</option><option>CloudWatch</option>
          </select>
        </div>
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
                  <span className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              </div>
              {a.status === "ACTIVE" && (
                <div className="flex items-center gap-2 shrink-0">
                  <button className="text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded">Ack</button>
                  <button className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 px-2 py-1 rounded">Resolve</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
