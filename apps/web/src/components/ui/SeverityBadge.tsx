import { clsx } from "clsx";
import type { Severity } from "@autoops/shared";

const severityConfig: Record<Severity, { label: string; className: string }> = {
  LOW: {
    label: "Low",
    className: "bg-blue-100 text-blue-700",
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-yellow-100 text-yellow-700",
  },
  HIGH: {
    label: "High",
    className: "bg-orange-100 text-orange-700",
  },
  CRITICAL: {
    label: "Critical",
    className: "bg-red-100 text-red-700",
  },
};

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const cfg = severityConfig[severity];

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
