import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import type { Severity, AlertStatus } from "@autoops/shared";

export const metadata: Metadata = {
  title: "Alerts | AutoOps",
};

const alerts = [
  {
    id: "1",
    title: "High memory usage detected",
    message: "Worker service memory usage exceeded 85% threshold",
    severity: "HIGH" as Severity,
    status: "ACTIVE" as AlertStatus,
    source: "prometheus",
    createdAt: "2024-01-15T11:30:00Z",
  },
  {
    id: "2",
    title: "Slow database queries",
    message: "P99 query latency exceeded 500ms for the past 10 minutes",
    severity: "MEDIUM" as Severity,
    status: "ACKNOWLEDGED" as AlertStatus,
    source: "datadog",
    createdAt: "2024-01-15T10:45:00Z",
  },
  {
    id: "3",
    title: "Disk space warning",
    message: "API server disk usage at 78% - consider cleanup",
    severity: "LOW" as Severity,
    status: "ACTIVE" as AlertStatus,
    source: "cloudwatch",
    createdAt: "2024-01-15T09:00:00Z",
  },
  {
    id: "4",
    title: "Network packet loss",
    message: "Packet loss rate exceeded 1% between services",
    severity: "CRITICAL" as Severity,
    status: "RESOLVED" as AlertStatus,
    source: "prometheus",
    createdAt: "2024-01-14T23:30:00Z",
  },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 mt-1">
            Monitor and respond to operational alerts
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
          <input
            type="search"
            placeholder="Search alerts..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Sources</option>
            <option value="prometheus">Prometheus</option>
            <option value="datadog">Datadog</option>
            <option value="cloudwatch">CloudWatch</option>
          </select>
        </div>

        <div className="divide-y divide-gray-100">
          {alerts.map((alert) => (
            <div key={alert.id} className="px-6 py-4 flex items-start gap-4">
              <SeverityBadge severity={alert.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                  <StatusBadge status={alert.status} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{alert.message}</p>
                <div className="flex items-center gap-4 mt-1.5">
                  <span className="text-xs text-gray-400">
                    Source: {alert.source}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(alert.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              {alert.status === "ACTIVE" && (
                <div className="flex items-center gap-2">
                  <button className="text-xs text-yellow-600 hover:text-yellow-700 font-medium border border-yellow-200 px-2 py-1 rounded">
                    Acknowledge
                  </button>
                  <button className="text-xs text-green-600 hover:text-green-700 font-medium border border-green-200 px-2 py-1 rounded">
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
