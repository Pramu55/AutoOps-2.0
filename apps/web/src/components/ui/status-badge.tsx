import { cn } from '@/lib/cn';

export type StatusToneType =
  | 'CONNECTED'
  | 'DISABLED'
  | 'NOT_CONFIGURED'
  | 'BLOCKED_BY_ORG_POLICY'
  | 'UNREACHABLE'
  | 'AUTH_FAILED'
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'ARCHIVED'
  | 'INFO'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PENDING_APPROVAL'
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'READY'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'TRIGGERED'
  | 'MITIGATED'
  | 'NOT_CONNECTED'
  | 'SEV1'
  | 'SEV2'
  | 'SEV3'
  | 'SEV4'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'EMPTY';

interface StatusBadgeProps {
  status: string;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ status, className, dot = false }: StatusBadgeProps) {
  const normStatus = (status || 'UNKNOWN').toUpperCase();

  let toneClass = 'border-slate-500/25 bg-slate-500/10 text-slate-700'; // Default gray
  let dotClass = 'bg-slate-500';

  // Emerald/Success
  if (
    ['CONNECTED', 'RESOLVED', 'SUCCEEDED', 'APPROVED', 'READY', 'HEALTHY', 'RUNNING', 'SEV4', 'LOW'].includes(normStatus)
  ) {
    toneClass = 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700';
    dotClass = 'bg-emerald-500';
  }
  // Amber/Warning
  else if (
    ['WARNING', 'ACKNOWLEDGED', 'NOT_CONFIGURED', 'PENDING_APPROVAL', 'APPROVAL_REQUIRED', 'QUEUED', 'DEGRADED', 'MITIGATED', 'SEV3', 'MEDIUM'].includes(normStatus)
  ) {
    toneClass = 'border-amber-400/25 bg-amber-400/10 text-amber-700';
    dotClass = 'bg-amber-500';
  }
  // Rose/Error
  else if (
    ['ERROR', 'CRITICAL', 'FAILED', 'REJECTED', 'UNREACHABLE', 'AUTH_FAILED', 'OPEN', 'OFFLINE', 'TRIGGERED', 'SEV1', 'SEV2', 'HIGH'].includes(normStatus)
  ) {
    toneClass = 'border-rose-400/30 bg-rose-500/10 text-rose-700';
    dotClass = 'bg-rose-500';
  }
  // Blue/Info
  else if (
    ['INFO', 'ARCHIVED'].includes(normStatus)
  ) {
    toneClass = 'border-blue-300/25 bg-blue-300/10 text-blue-700';
    dotClass = 'bg-blue-500';
  }
  // Slate/Neutral
  else if (
    ['DISABLED', 'BLOCKED_BY_ORG_POLICY', 'NOT_CONNECTED', 'UNKNOWN', 'EMPTY'].includes(normStatus)
  ) {
    toneClass = 'border-slate-300/60 bg-slate-100/50 text-slate-600';
    dotClass = 'bg-slate-400';
  }

  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]',
        toneClass,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />}
      {status}
    </span>
  );
}
