import { clsx } from "clsx";
import type { ServiceStatus, IncidentStatus, AlertStatus, WorkflowStatus } from "@autoops/shared";

type AnyStatus = ServiceStatus | IncidentStatus | AlertStatus | WorkflowStatus;

const statusConfig: Record<string, { label: string; className: string }> = {
  OPERATIONAL:  { label: "Operational",  className: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30" },
  DEGRADED:     { label: "Degraded",     className: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30" },
  OUTAGE:       { label: "Outage",       className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" },
  MAINTENANCE:  { label: "Maintenance",  className: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" },
  OPEN:         { label: "Open",         className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" },
  INVESTIGATING:{ label: "Investigating",className: "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30" },
  RESOLVED:     { label: "Resolved",     className: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30" },
  CLOSED:       { label: "Closed",       className: "bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30" },
  ACTIVE:       { label: "Active",       className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" },
  ACKNOWLEDGED: { label: "Acknowledged", className: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30" },
  PENDING:      { label: "Pending",      className: "bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30" },
  RUNNING:      { label: "Running",      className: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" },
  COMPLETED:    { label: "Completed",    className: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30" },
  FAILED:       { label: "Failed",       className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" },
  CANCELLED:    { label: "Cancelled",    className: "bg-gray-500/15 text-gray-500 ring-1 ring-gray-500/30" },
};

interface StatusBadgeProps { status: AnyStatus; className?: string }

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, className: "bg-gray-500/15 text-gray-400" };
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", cfg.className, className)}>
      {cfg.label}
    </span>
  );
}
