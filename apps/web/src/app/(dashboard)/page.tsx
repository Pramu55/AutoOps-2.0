import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { ServiceStatus, Severity } from "@autoops/shared";

export const metadata: Metadata = { title: "Dashboard | AutoOps" };

const stats = [
  { label: "Active Incidents", value: "3", sub: "+1 this week", color: "text-red-400" },
  { label: "Services", value: "12", sub: "All monitored", color: "text-green-400" },
  { label: "Active Workflows", value: "5", sub: "Running", color: "text-blue-400" },
  { label: "Open Alerts", value: "7", sub: "−3 this week", color: "text-yellow-400" },
];

const recentIncidents = [
  { id: "1", title: "Database connection timeout", severity: "HIGH" as Severity, status: "INVESTIGATING", service: "API Gateway", time: "2h ago" },
  { id: "2", title: "High CPU utilization on workers", severity: "MEDIUM" as Severity, status: "OPEN", service: "Worker Service", time: "4h ago" },
  { id: "3", title: "SSL certificate expiring soon", severity: "LOW" as Severity, status: "OPEN", service: "API Gateway", time: "6h ago" },
];

const serviceHealth = [
  { name: "API Gateway", status: "DEGRADED" as ServiceStatus, uptime: "99.1%" },
  { name: "Auth Service", status: "OPERATIONAL" as ServiceStatus, uptime: "99.9%" },
  { name: "Worker Service", status: "OPERATIONAL" as ServiceStatus, uptime: "99.7%" },
  { name: "Database", status: "OPERATIONAL" as ServiceStatus, uptime: "100%" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Operations Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time overview of your infrastructure</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-5">
            <p className="text-sm text-gray-400">{s.label}</p>
            <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
            <p className={`text-xs mt-2 ${s.color}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Incidents */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Incidents</h2>
            <a href="/incidents" className="text-xs text-blue-400 hover:text-blue-300">View all →</a>
          </div>
          <div className="space-y-3">
            {recentIncidents.map((i) => (
              <div key={i.id} className="flex items-start gap-3 pb-3 border-b border-[#2a2d3a] last:border-0 last:pb-0">
                <SeverityBadge severity={i.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{i.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{i.service} · {i.time}</p>
                </div>
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded shrink-0">{i.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Service Health */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Service Health</h2>
            <a href="/services" className="text-xs text-blue-400 hover:text-blue-300">View all →</a>
          </div>
          <div className="space-y-3">
            {serviceHealth.map((s) => (
              <div key={s.name} className="flex items-center justify-between pb-3 border-b border-[#2a2d3a] last:border-0 last:pb-0">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${s.status === "OPERATIONAL" ? "bg-green-500" : s.status === "DEGRADED" ? "bg-yellow-500" : "bg-red-500"}`} />
                  <span className="text-sm text-white">{s.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{s.uptime}</span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
