import React from 'react';
import Link from 'next/link';
import { StatusBadge } from '../ui/status-badge';
import { cn } from '@/lib/cn';
import { ExternalLink } from 'lucide-react';

interface ProviderStateCardProps {
  name: string;
  category: string;
  status: string;
  safetyMode: string;
  purpose: string;
  setupGuidance: string;
  href?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function ProviderStateCard({
  name,
  category,
  status,
  safetyMode,
  purpose,
  setupGuidance,
  href,
  icon,
  className,
}: ProviderStateCardProps) {
  return (
    <article className={cn("ao-card ao-card-hover flex flex-col rounded-2xl bg-white p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
              {icon}
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{category}</p>
            <h3 className="text-base font-bold text-slate-900">{name}</h3>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 flex-1">
        <p className="text-sm font-medium text-slate-900">{purpose}</p>
        <p className="mt-2 text-xs leading-5 text-slate-600 border-l-2 border-slate-200 pl-3">
          {setupGuidance}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Safety Mode:</span>
          <span className="ao-pill px-2 py-0.5 text-[10px]">
            {safetyMode}
          </span>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-colors"
          >
            Open <ExternalLink className="h-3 w-3 text-slate-400" />
          </Link>
        )}
      </div>
    </article>
  );
}
