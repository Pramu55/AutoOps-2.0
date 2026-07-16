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
    <section className={cn("ao-card ao-card-hover overflow-hidden rounded-2xl bg-white", className)}>
      <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-5 py-4">
        <div className="flex items-center gap-3">
          {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">{icon}</div>}
          <div>
            <h3 className="text-sm font-extrabold text-slate-950">{title}</h3>
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
