import type { Metadata } from 'next';
import { Activity, GitMerge, Layers, TrendingUp } from 'lucide-react';

export const metadata: Metadata = { title: 'Dashboard' };

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  icon: React.ReactNode;
}

function StatCard({ label, value, delta, deltaUp, icon }: StatCardProps) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          {delta && (
            <p className={`mt-1 text-xs ${deltaUp ? 'text-emerald-400' : 'text-destructive'}`}>
              {deltaUp ? '↑' : '↓'} {delta} vs last 7d
            </p>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Real-time status of your infrastructure and deployments.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Projects"
          value="—"
          icon={<Layers className="h-5 w-5" />}
        />
        <StatCard
          label="Deployments (7d)"
          value="—"
          delta="—"
          deltaUp
          icon={<GitMerge className="h-5 w-5" />}
        />
        <StatCard
          label="Active Incidents"
          value="—"
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Success Rate"
          value="—"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-medium text-foreground">Recent Deployments</h2>
          <p className="text-sm text-muted-foreground">
            Deployments will appear here once you connect your first project.
          </p>
        </div>
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-medium text-foreground">System Health</h2>
          <p className="text-sm text-muted-foreground">
            Metrics will stream here from Prometheus once the stack is running.
          </p>
        </div>
      </div>
    </div>
  );
}
