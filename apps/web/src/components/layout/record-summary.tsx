import React from 'react';
import { StatusBadge } from '../ui/status-badge';
import { cn } from '@/lib/cn';

interface RecordSummaryProps {
  title: string;
  status: string;
  severity?: string;
  source?: string;
  timestamps: {
    label: string;
    value: string;
  }[];
  relatedEntity?: {
    label: string;
    value: React.ReactNode;
  };
  className?: string;
}

export function RecordSummary({
  title,
  status,
  severity,
  source,
  timestamps,
  relatedEntity,
  className,
}: RecordSummaryProps) {
  return (
    <section className={cn("ao-card ao-card-hover ao-section-top overflow-hidden rounded-2xl bg-white p-5 sm:p-6", className)}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="break-words text-xl font-extrabold tracking-tight text-slate-950">{title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {severity && <StatusBadge status={severity} />}
            {source && (
              <span className="ao-pill px-2.5 py-0.5 text-[11px]">
                {source}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
        {timestamps.map((ts, idx) => (
          <div key={idx}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{ts.label}</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{ts.value}</p>
          </div>
        ))}
        {relatedEntity && (
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{relatedEntity.label}</p>
            <div className="mt-1 text-sm">{relatedEntity.value}</div>
          </div>
        )}
      </div>
    </section>
  );
}
