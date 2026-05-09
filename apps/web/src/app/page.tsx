import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { ServiceStatus, Severity } from "@autoops/shared";

export const metadata: Metadata = {
  title: "Dashboard | AutoOps",
};

const stats = [
  { label: "Active Incidents", value: "3", change: "+1", trend: "up" },
  { label: "Services Monitored", value: "12", change: "+2", trend: "up" },
  { label: "Workflows Active", value: "5", change: "0", trend: "stable" },
  { label: "Active Alerts", value: "7", change: "-3", trend: "down" },
];

const recentIncidents = [
  {
    id: "1",
    title: "Database connection timeout",
    severity: "HIGH" as Severity,
    status: "INVESTIGATING",
    service: "API Gateway",
    time: "2 hours ago",
  },
  {
    id: "2",
    title: "High CPU utilization on worker nodes",
    severity: "MEDIUM" as Severity,
    status: "OPEN",
    service: "Worker Service",
    time: "4 hours ago",
  },
  {
    id: "3",
    title: "SSL certificate expiring soon",
    severity: "LOW" as Severity,
    status: "OPEN",
    service: "API Gateway",
    time: "6 hours ago",
  },
];

const serviceHealth = [
  { name: "API Gateway", status: "DEGRADED" as ServiceStatus, uptime: "99.1%" },
  {
    name: "Auth Service",
    status: "OPERATIONAL" as ServiceStatus,
    uptime: "99.9%",
  },
  {
    name: "Worker Service",
    status: "OPERATIONAL" as ServiceStatus,
    uptime: "99.7%",
  },
  { name: "Database", status: "OPERATIONAL" as ServiceStatus, uptime: "100%" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Real-time overview of your infrastructure and incidents
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
            <p
              className={`text-sm mt-2 ${
                stat.trend === "up"
                  ? "text-red-500"
                  : stat.trend === "down"
                  ? "text-green-500"
                  : "text-gray-400"
              }`}
            >
              {stat.change} this week
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Incidents</h2>
            <a
              href="/incidents"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all →
            </a>
          </div>
          <div className="space-y-4">
            {recentIncidents.map((incident) => (
              <div
                key={incident.id}
                className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0"
              >
                <SeverityBadge severity={incident.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {incident.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {incident.service} · {incident.time}
                  </p>
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {incident.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Service Health</h2>
            <a
              href="/services"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all →
            </a>
          </div>
          <div className="space-y-3">
            {serviceHealth.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      service.status === "OPERATIONAL"
                        ? "bg-green-500"
                        : service.status === "DEGRADED"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {service.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{service.uptime}</span>
                  <StatusBadge status={service.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
