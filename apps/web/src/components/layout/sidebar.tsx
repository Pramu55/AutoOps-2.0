'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  GitMerge,
  Activity,
  Bell,
  Settings,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWorkspaceStore } from '@/stores/workspace';

const NAV_ITEMS = [
  { href: '/dashboard',             label: 'Overview',    icon: LayoutDashboard },
  { href: '/dashboard/projects',    label: 'Projects',    icon: Layers },
  { href: '/dashboard/deployments', label: 'Deployments', icon: GitMerge },
  { href: '/dashboard/observability', label: 'Observability', icon: Activity },
  { href: '/dashboard/alerts',      label: 'Alerts',      icon: Bell },
] as const;

const BOTTOM_ITEMS = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname   = usePathname();
  const currentOrg = useWorkspaceStore((s) => s.currentOrg);

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card">
      {/* Logo + workspace switcher */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/30">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <span className="truncate text-sm font-semibold text-foreground">
            {currentOrg?.name ?? 'AutoOps'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === href
              : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-border px-2 py-3">
        <ul className="space-y-0.5">
          {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
