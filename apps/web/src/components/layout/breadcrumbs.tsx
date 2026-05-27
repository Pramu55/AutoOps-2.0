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
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-xs text-slate-500', className)}>
      <ol className="flex items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link 
                  href={item.href} 
                  className="font-medium hover:text-slate-900 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast ? "font-semibold text-slate-900" : "font-medium")}>
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
