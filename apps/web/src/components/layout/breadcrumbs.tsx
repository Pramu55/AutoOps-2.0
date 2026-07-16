import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 text-xs text-slate-500', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex min-w-0 items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="min-w-0 truncate font-medium transition-colors hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn("min-w-0 truncate", isLast ? "font-semibold text-slate-900" : "font-medium")}>
                  {item.label}
                </span>
              )}

              {!isLast && (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
