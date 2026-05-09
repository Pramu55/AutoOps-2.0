import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { Severity, IncidentStatus } from "@autoops/shared";

export const metadata: Metadata = {
  title: "Incidents | AutoOps",
};

const incidents = [
  {
    id: "1",
    title: "Database connection timeout causing increased latency",
    severity: "HIGH" as Severity,
    status: "INVESTIGATING" as IncidentStatus,
    service: "API Gateway",
    assignee: "Jane Smith",
    createdAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "2",
    title: "High CPU utilization on worker nodes",
    severity: "MEDIUM" as Severity,
    status: "OPEN" as IncidentStatus,
    service: "Worker Service",
    assignee: null,
    createdAt: "2024-01-15T08:30:00Z",
  },
  {
    id: "3",
    title: "SSL certificate expiring in 7 days",
    severity: "LOW" as Severity,
    status: "OPEN" as IncidentStatus,
    service: "API Gateway",
    assignee: "John Doe",
    createdAt: "2024-01-15T06:00:00Z",
  },
  {
    id: "4",
    title: "Memory leak detected in authentication service",
    severity: "CRITICAL" as Severity,
    status: "RESOLVED" as IncidentStatus,
    service: "Auth Service",
    assignee: "Alice Chen",
    createdAt: "2024-01-14T22:00:00Z",
  },
];

export default function IncidentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-gray-500 mt-1">
            Track and manage operational incidents
          </p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Create Incident
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
          <input
            type="search"
            placeholder="Search incidents..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <th className="text-left px-6 py-3">Incident</th>
              <th className="text-left px-6 py-3">Severity</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Service</th>
              <th className="text-left px-6 py-3">Assignee</th>
              <th className="text-left px-6 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">
                    {incident.title}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <SeverityBadge severity={incident.severity} />
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={incident.status} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {incident.service}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {incident.assignee ?? (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(incident.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
