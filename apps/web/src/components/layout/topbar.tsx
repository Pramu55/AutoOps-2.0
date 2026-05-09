'use client';

import { useRouter } from 'next/navigation';
import { Bell, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';
import { api } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { cn } from '@/lib/cn';

export function Topbar() {
  const router     = useRouter();
  const user       = useAuthStore((s) => s.user);
  const clearAuth  = useAuthStore((s) => s.clearAuth);
  const resetWs    = useWorkspaceStore((s) => s.reset);

  async function handleLogout() {
    try {
      await api.post('/v1/auth/logout', {});
    } catch {
      // best-effort
    }
    disconnectSocket();
    clearAuth();
    resetWs();
    router.replace('/login');
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-5">
      {/* Left — breadcrumb placeholder (Phase 2 will populate this) */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Dashboard</span>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              'bg-primary/20 ring-1 ring-primary/30 text-xs font-semibold text-primary',
            )}
          >
            {initials}
          </div>
          <span className="hidden text-sm text-foreground lg:block">{user?.name}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => void handleLogout()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
