import React from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'card' | 'compact';
}

export function EmptyState({ title, description, icon, action, className, variant = 'default' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === 'card' && "rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10",
        variant === 'default' && "py-12",
        variant === 'compact' && "rounded-md border border-dashed border-slate-200 bg-slate-50 p-6",
        className
      )}
    >
      {icon && (
        <div className={cn(
          "flex items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-4",
          variant === 'compact' ? "h-10 w-10" : "h-12 w-12"
        )}>
          {icon}
        </div>
      )}
      <h3 className={cn(
        "font-semibold text-slate-900",
        variant === 'compact' ? "text-sm" : "text-base"
      )}>
        {title}
      </h3>
      <p className={cn(
        "mt-1 text-slate-500 max-w-sm",
        variant === 'compact' ? "text-xs" : "text-sm"
      )}>
        {description}
      </p>
      {action && (
        <div className={cn("mt-5", variant === 'compact' && "mt-4")}>
          {action}
        </div>
      )}
    </div>
  );
}
