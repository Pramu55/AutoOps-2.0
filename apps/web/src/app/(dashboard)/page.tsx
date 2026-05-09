"use client";

import { useStats } from "@/hooks/index";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageSpinner } from "@/components/ui/Spinner";
import type { Severity, IncidentStatus } from "@autoops/shared";
import Link from "next/link";

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) return <PageSpinner />;
  if (error) return (
    <div className="text-center py-20 text-red-400 text-sm">
      Failed to load dashboard — {error.message}
    </div>
  );
  if (!stats) return null;

  const statCards = [
    {
      label: "Active Incidents",
      value: stats.incidents.active,
      color: stats.incidents.active > 0 ? "text-red-400" : "text-green-400",
      href: "/incidents",
    },
    {
      label: "Services",
      value: stats.services.total,
      sub: stats.services.degraded > 0 || stats.services.outage > 0
        ? `${stats.services.degraded + stats.services.outage} degraded`
        : "All operational",
      color: stats.services.degraded > 0 || stats.services.outage > 0
        ? "text-yellow-400"
        : "text-green-400",
      href: "/services",
    },
    {
      label: "Active Workflows",
      value: stats.workflows.active,
      color: "text-blue-400",
      href: "/workflows",
    },
    {
      label: "Open Alerts",
      value: stats.alerts.open,
      color: stats.alerts.open > 5 ? "text-red-400" : stats.alerts.open > 0 ? "text-yellow-400" : "text-green-400",
      href: "/alerts",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Operations Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time overview of your infrastructure</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-5 hover:border-[#3a3d4a] transition-colors">
              <p className="text-sm text-gray-400">{s.label}</p>
              <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
              {s.sub && <p className={`text-xs mt-2 ${s.color}`}>{s.sub}</p>}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Incidents */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Active Incidents</h2>
            <Link href="/incidents" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          {stats.recentIncidents.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No active incidents</p>
          ) : (
            <div className="space-y-3">
              {stats.recentIncidents.map((i) => (
                <div
                  key={i.id}
                  className="flex items-start gap-3 pb-3 border-b border-[#2a2d3a] last:border-0 last:pb-0"
                >
                  <SeverityBadge severity={i.severity as Severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{i.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {i.service.name} · {timeAgo(i.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={i.status as IncidentStatus} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Service Health */}
        <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Service Health</h2>
            <Link href="/services" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#2a2d3a]">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-white">Operational</span>
              </div>
              <span className="text-lg font-bold text-green-400">
                {stats.services.operational}
              </span>
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-[#2a2d3a]">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-sm text-white">Degraded</span>
              </div>
              <span className="text-lg font-bold text-yellow-400">
                {stats.services.degraded}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm text-white">Outage</span>
              </div>
              <span className="text-lg font-bold text-red-400">
                {stats.services.outage}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
