import React from 'react';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { BackLink } from './back-link';
import { cn } from '@/lib/cn';

interface WorkspaceHeaderProps {
  title: string | React.ReactNode;
  purpose?: string;
  icon?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  backLink?: { href: string; label: string };
  statusSummary?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export function WorkspaceHeader({
  title,
  purpose,
  icon,
  breadcrumbs,
  backLink,
  statusSummary,
  primaryAction,
  secondaryAction,
  className,
}: WorkspaceHeaderProps) {
  return (
    <section className={cn("ao-card ao-card-hover rounded-2xl bg-[linear-gradient(135deg,#ffffff,#f8fafc)] px-5 py-5 sm:px-6 lg:px-7", className)}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {backLink && (
              <BackLink href={backLink.href} label={backLink.label} />
            )}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <Breadcrumbs items={breadcrumbs} />
            )}
          </div>
          {statusSummary && (
            <div className="flex items-center">
              {statusSummary}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-2">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm">
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 lg:text-3xl">
                {title}
              </h1>
              {purpose && (
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                  {purpose}
                </p>
              )}
            </div>
          </div>

          {(primaryAction || secondaryAction) && (
            <div className="flex flex-wrap items-center gap-3 shrink-0 mt-2 sm:mt-0">
              {secondaryAction}
              {primaryAction}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
