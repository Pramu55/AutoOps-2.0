'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bell,
  ChevronDown,
  Gauge,
  GitMerge,
  Layers,
  LayoutDashboard,
  Settings,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWorkspaceStore } from '@/stores/workspace';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'Projects', icon: Layers },
  { href: '/dashboard/deployments', label: 'Deployments', icon: GitMerge },
  { href: '/dashboard/operations', label: 'Operations', icon: Gauge },
  { href: '/dashboard/observability', label: 'Observability', icon: Activity },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
] as const;

const BOTTOM_ITEMS = [
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const currentOrg = useWorkspaceStore((state) => state.currentOrg);

  return (
    <aside className="hidden h-full w-[17rem] shrink-0 flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-lg shadow-blue-600/20">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">AutoOps</span>
            <span className="block truncate text-xs text-slate-400">{currentOrg?.name ?? 'Control plane'}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operate</p>
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                    active
                      ? 'bg-gradient-to-r from-white to-slate-200 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white',
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

      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/12 to-cyan-400/8 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Runtime green
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">API, worker, Redis, and Postgres verified.</p>
        </div>
        <ul className="space-y-1">
          {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  pathname.startsWith(href)
                    ? 'bg-gradient-to-r from-white to-slate-200 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:bg-white/10 hover:text-white',
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
