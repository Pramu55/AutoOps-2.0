import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ServiceStatus } from "@autoops/shared";

export const metadata: Metadata = { title: "Services | AutoOps" };

const services = [
  { id: "1", name: "API Gateway", description: "Main API gateway and load balancer", status: "DEGRADED" as ServiceStatus, uptime: "99.1%", activeIncidents: 2, lastChecked: "1 min ago" },
  { id: "2", name: "Authentication Service", description: "User authentication and session management", status: "OPERATIONAL" as ServiceStatus, uptime: "99.9%", activeIncidents: 0, lastChecked: "30s ago" },
  { id: "3", name: "Worker Service", description: "Background job processing and task queue", status: "OPERATIONAL" as ServiceStatus, uptime: "99.7%", activeIncidents: 1, lastChecked: "45s ago" },
  { id: "4", name: "Database", description: "Primary PostgreSQL database cluster", status: "OPERATIONAL" as ServiceStatus, uptime: "100%", activeIncidents: 0, lastChecked: "15s ago" },
];

const dot = { OPERATIONAL: "bg-green-500", DEGRADED: "bg-yellow-500", OUTAGE: "bg-red-500", MAINTENANCE: "bg-blue-500" };

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Services</h1>
          <p className="text-gray-400 mt-1">Monitor the health of your infrastructure</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Add Service
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((s) => (
          <div key={s.id} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6 hover:border-[#3a3d4a] transition-colors cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${dot[s.status] ?? "bg-gray-500"}`} />
                <h3 className="font-semibold text-white">{s.name}</h3>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <p className="text-sm text-gray-400 mb-4">{s.description}</p>
            <div className="flex items-center gap-6 text-sm">
              <div><p className="text-xs text-gray-500">Uptime</p><p className="font-medium text-white">{s.uptime}</p></div>
              <div><p className="text-xs text-gray-500">Active Incidents</p><p className={`font-medium ${s.activeIncidents > 0 ? "text-red-400" : "text-green-400"}`}>{s.activeIncidents}</p></div>
              <div><p className="text-xs text-gray-500">Last Checked</p><p className="font-medium text-white">{s.lastChecked}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
