import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ServiceStatus } from "@autoops/shared";

export const metadata: Metadata = {
  title: "Services | AutoOps",
};

const services = [
  {
    id: "1",
    name: "API Gateway",
    description: "Main API gateway and load balancer",
    status: "DEGRADED" as ServiceStatus,
    uptime: "99.1%",
    activeIncidents: 2,
    lastChecked: "1 minute ago",
  },
  {
    id: "2",
    name: "Authentication Service",
    description: "User authentication and session management",
    status: "OPERATIONAL" as ServiceStatus,
    uptime: "99.9%",
    activeIncidents: 0,
    lastChecked: "30 seconds ago",
  },
  {
    id: "3",
    name: "Worker Service",
    description: "Background job processing and task queue",
    status: "OPERATIONAL" as ServiceStatus,
    uptime: "99.7%",
    activeIncidents: 1,
    lastChecked: "45 seconds ago",
  },
  {
    id: "4",
    name: "Database",
    description: "Primary PostgreSQL database cluster",
    status: "OPERATIONAL" as ServiceStatus,
    uptime: "100%",
    activeIncidents: 0,
    lastChecked: "15 seconds ago",
  },
];

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-500 mt-1">
            Monitor the health of your infrastructure services
          </p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Add Service
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <div
            key={service.id}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    service.status === "OPERATIONAL"
                      ? "bg-green-500"
                      : service.status === "DEGRADED"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                />
                <h3 className="font-semibold text-gray-900">{service.name}</h3>
              </div>
              <StatusBadge status={service.status} />
            </div>
            <p className="text-sm text-gray-500 mb-4">{service.description}</p>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Uptime</p>
                <p className="font-medium text-gray-900">{service.uptime}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Active Incidents</p>
                <p
                  className={`font-medium ${
                    service.activeIncidents > 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {service.activeIncidents}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Last Checked</p>
                <p className="font-medium text-gray-900">{service.lastChecked}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
