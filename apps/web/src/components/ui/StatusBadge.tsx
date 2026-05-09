import { clsx } from "clsx";
import type { ServiceStatus, IncidentStatus, AlertStatus, WorkflowStatus } from "@autoops/shared";

type AnyStatus = ServiceStatus | IncidentStatus | AlertStatus | WorkflowStatus;

const statusConfig: Record<string, { label: string; className: string }> = {
  OPERATIONAL: {
    label: "Operational",
    className: "bg-green-100 text-green-700",
  },
  DEGRADED: {
    label: "Degraded",
    className: "bg-yellow-100 text-yellow-700",
  },
  OUTAGE: {
    label: "Outage",
    className: "bg-red-100 text-red-700",
  },
  MAINTENANCE: {
    label: "Maintenance",
    className: "bg-blue-100 text-blue-700",
  },
  OPEN: {
    label: "Open",
    className: "bg-red-100 text-red-700",
  },
  INVESTIGATING: {
    label: "Investigating",
    className: "bg-orange-100 text-orange-700",
  },
  RESOLVED: {
    label: "Resolved",
    className: "bg-green-100 text-green-700",
  },
  CLOSED: {
    label: "Closed",
    className: "bg-gray-100 text-gray-600",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-red-100 text-red-700",
  },
  ACKNOWLEDGED: {
    label: "Acknowledged",
    className: "bg-yellow-100 text-yellow-700",
  },
  PENDING: {
    label: "Pending",
    className: "bg-gray-100 text-gray-600",
  },
  RUNNING: {
    label: "Running",
    className: "bg-blue-100 text-blue-700",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-100 text-red-700",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-500",
  },
};

interface StatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}
