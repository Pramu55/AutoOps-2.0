import React from 'react';
import { cn } from '@/lib/cn';

interface EvidencePanelProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function EvidencePanel({ title, description, icon, children, className }: EvidencePanelProps) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden", className)}>
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <div className="flex items-center gap-3">
          {icon && <div className="text-slate-500">{icon}</div>}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
        </div>
      </div>
      <div className="p-0">
        {children}
      </div>
    </section>
  );
}
