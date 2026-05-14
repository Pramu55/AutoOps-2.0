'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  Command,
  Gauge,
  GitMerge,
  Layers,
  LogOut,
  RadioTower,
  Search,
  Settings,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAuthSession } from '@/lib/auth-session';
import { cn } from '@/lib/cn';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Command', icon: Command },
  { href: '/dashboard/projects', label: 'Projects', icon: Layers },
  { href: '/dashboard/deployments', label: 'Deployments', icon: GitMerge },
  { href: '/dashboard/operations', label: 'Ops Hub', icon: Gauge },
  { href: '/dashboard/observability', label: 'Observe', icon: Activity },
  { href: '/dashboard/alerts', label: 'Alerts', icon: ShieldAlert },
  { href: '/dashboard/settings', label: 'Govern', icon: Settings },
] as const;

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Command';
  const segment = pathname.split('/').filter(Boolean).at(-1) ?? 'dashboard';
  return segment.replaceAll('-', ' ');
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const resetWorkspace = useWorkspaceStore((state) => state.reset);
  const currentOrg = useWorkspaceStore((state) => state.currentOrg);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const matchedNavItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query));
  }, [searchQuery]);

  function handleLogout() {
    disconnectSocket();
    clearAuthSession();
    clearAuth();
    resetWorkspace();
    router.replace('/login');
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AO';

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050816]/88 backdrop-blur-2xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1680px] items-center gap-3 px-4 sm:px-5 lg:px-8">
        <Link href="/dashboard" className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 shadow-lg shadow-blue-950/40">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-semibold text-white">AutoOps</p>
            <p className="truncate text-[11px] text-slate-500">{currentOrg?.name ?? 'Control Plane'}</p>
          </div>
        </Link>

        <nav className="hidden min-w-0 flex-1 justify-center lg:flex">
          <div className="flex max-w-full items-center gap-1 overflow-hidden rounded-full border border-white/10 bg-white/[0.045] p-1 shadow-2xl shadow-black/20">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex h-10 min-w-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition xl:px-4',
                    active
                      ? 'bg-white text-slate-950 shadow-lg shadow-black/20'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-600' : 'text-slate-500 group-hover:text-cyan-300')} />
                  <span className="hidden xl:inline">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden rounded-full border-emerald-300/20 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/15 hover:text-emerald-100 2xl:inline-flex"
          >
            <Link href="/dashboard/observability">
              <RadioTower className="h-3.5 w-3.5" />
              Live runtime
            </Link>
          </Button>

          <div className="relative">
            {isSearchOpen ? (
              <div className="flex h-10 w-56 items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 px-3 shadow-xl">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Find module..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="text-slate-500 transition hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Search modules"
                onClick={() => setIsSearchOpen(true)}
                className="rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}

            {isSearchOpen && searchQuery.trim() ? (
              <div className="absolute right-0 top-12 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-black/40">
                {matchedNavItems.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">No matching modules.</p>
                ) : (
                  matchedNavItems.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => {
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <Icon className="h-4 w-4 text-cyan-300" />
                      {label}
                    </Link>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <Button asChild variant="ghost" size="icon" aria-label="Alerts" className="rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
            <Link href="/dashboard/alerts">
              <Bell className="h-4 w-4" />
            </Link>
          </Button>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] py-1 pl-1 pr-3 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="hidden max-w-36 lg:block">
              <p className="truncate text-xs font-medium text-white">{user?.name ?? 'Operator'}</p>
              <p className="truncate text-[10px] text-slate-500">{user?.email ?? 'autoops'}</p>
            </div>
          </div>

          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={handleLogout} className="rounded-full text-slate-400 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1680px] items-center gap-3 border-t border-white/5 px-4 py-2 sm:px-5 lg:hidden">
        <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium capitalize text-slate-300">
          {getPageTitle(pathname)}
        </div>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition',
                  active ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
