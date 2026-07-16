import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { ChevronRight } from 'lucide-react';

interface WorkQueueProps {
  title: string;
  description?: string;
  count?: number;
  viewAllLink?: string;
  emptyState: React.ReactNode;
  children: React.ReactNode;
  isEmpty: boolean;
  className?: string;
}

export function WorkQueue({
  title,
  description,
  count,
  viewAllLink,
  emptyState,
  children,
  isEmpty,
  className,
}: WorkQueueProps) {
  return (
    <section className={cn("ao-card ao-card-hover ao-section-top flex flex-col overflow-hidden rounded-2xl bg-white", className)}>
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
            {count !== undefined && (
              <span className="ao-pill px-2 py-0 text-[11px]">
                {count}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
        {viewAllLink && (
          <Link
            href={viewAllLink}
            className="group ao-link text-sm"
          >
            View all
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      <div className="p-0 flex-1 flex flex-col">
        {isEmpty ? (
          <div className="p-5">
            {emptyState}
          </div>
        ) : (
          <div className="flex flex-1 flex-col divide-y divide-slate-100">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
