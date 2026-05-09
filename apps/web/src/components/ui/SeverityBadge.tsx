import { clsx } from "clsx";
import type { Severity } from "@autoops/shared";

const severityConfig: Record<Severity, { label: string; className: string }> = {
  LOW:      { label: "Low",      className: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" },
  MEDIUM:   { label: "Medium",   className: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30" },
  HIGH:     { label: "High",     className: "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30" },
  CRITICAL: { label: "Critical", className: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" },
};

interface SeverityBadgeProps { severity: Severity; className?: string }

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const cfg = severityConfig[severity];
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", cfg.className, className)}>
      {cfg.label}
    </span>
  );
}
