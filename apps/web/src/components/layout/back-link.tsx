import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface BackLinkProps {
  href: string;
  label: string;
  className?: string;
}

export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900",
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
