import React from 'react';
import { cn } from '@/lib/cn';



interface ContextPanelProps {
  title?: string;
  description?: string;
  actions: React.ReactNode[];
  className?: string;
}

export function ContextPanel({ title = "Next Best Actions", description, actions, className }: ContextPanelProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-blue-200 bg-blue-50/50 p-5", className)}>
      <h3 className="text-sm font-semibold text-blue-900">{title}</h3>
      {description && <p className="mt-1 text-xs text-blue-700/80">{description}</p>}
      <div className="mt-4 flex flex-col gap-3">
        {actions.map((action, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
              {idx + 1}
            </div>
            <div className="text-sm text-blue-800">
              {action}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
