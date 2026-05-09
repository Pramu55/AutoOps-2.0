import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { Severity, IncidentStatus } from "@autoops/shared";

export const metadata: Metadata = { title: "Incidents | AutoOps" };

const incidents = [
  { id: "1", title: "Database connection timeout causing increased latency", severity: "HIGH" as Severity, status: "INVESTIGATING" as IncidentStatus, service: "API Gateway", assignee: "Jane Smith", createdAt: "2024-01-15T10:00:00Z" },
  { id: "2", title: "High CPU utilization on worker nodes", severity: "MEDIUM" as Severity, status: "OPEN" as IncidentStatus, service: "Worker Service", assignee: null, createdAt: "2024-01-15T08:30:00Z" },
  { id: "3", title: "SSL certificate expiring in 7 days", severity: "LOW" as Severity, status: "OPEN" as IncidentStatus, service: "API Gateway", assignee: "John Doe", createdAt: "2024-01-15T06:00:00Z" },
  { id: "4", title: "Memory leak in authentication service", severity: "CRITICAL" as Severity, status: "RESOLVED" as IncidentStatus, service: "Auth Service", assignee: "Alice Chen", createdAt: "2024-01-14T22:00:00Z" },
];

export default function IncidentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidents</h1>
          <p className="text-gray-400 mt-1">Track and manage operational incidents</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Create Incident
        </button>
      </div>

      <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2a2d3a] flex items-center gap-3">
          <input type="search" placeholder="Search incidents…" className="flex-1 bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <select className="bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500">
            <option value="">All Severities</option>
            <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-[#2a2d3a]">
              {["Incident", "Severity", "Status", "Service", "Assignee", "Created"].map((h) => (
                <th key={h} className="text-left px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2d3a]">
            {incidents.map((i) => (
              <tr key={i.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer">
                <td className="px-6 py-4 text-sm text-white font-medium">{i.title}</td>
                <td className="px-6 py-4"><SeverityBadge severity={i.severity} /></td>
                <td className="px-6 py-4"><StatusBadge status={i.status} /></td>
                <td className="px-6 py-4 text-sm text-gray-400">{i.service}</td>
                <td className="px-6 py-4 text-sm text-gray-400">{i.assignee ?? <span className="text-gray-600 italic">Unassigned</span>}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(i.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
