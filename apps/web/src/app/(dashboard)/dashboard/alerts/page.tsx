import type { Metadata } from 'next';
import { AlertCircle, Bell, Clock, Database, RadioTower, Server, Siren, Workflow } from 'lucide-react';

export const metadata: Metadata = { title: 'Alerts' };

const rules = [
  { name: 'API unhealthy', trigger: 'Health-ready endpoint fails or degrades', icon: Server },
  { name: 'Worker unhealthy', trigger: 'Worker heartbeat missing or job processor unavailable', icon: Workflow },
  { name: 'Redis unavailable', trigger: 'Redis connection failure or BullMQ command errors', icon: RadioTower },
  { name: 'Postgres unavailable', trigger: 'Database readiness check fails', icon: Database },
  { name: 'Queue backlog', trigger: 'Waiting jobs exceed configured threshold', icon: Clock },
  { name: 'Deployment stuck', trigger: 'Deployment remains in a transitional state too long', icon: AlertCircle },
  { name: 'Deployment failure spike', trigger: 'Failure rate exceeds release policy threshold', icon: Siren },
];

export default function AlertsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Incident Readiness</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Alerts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Alert rule catalog for platform health and deployment safety. Active alert data
          will be connected later; this page does not invent incidents.
        </p>
      </div>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Active Alerts</h2>
            <p className="mt-1 text-sm text-muted-foreground">No alert source is connected yet.</p>
          </div>
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-5 rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
          <p className="text-sm font-medium text-foreground">No active alerts</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            This empty state is ready for alert manager events, acknowledgement state,
            severity, ownership, runbook links, and incident timelines.
          </p>
        </div>
      </section>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Alert Rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">Rules staged for future evaluator and notification wiring.</p>
          </div>
          <Siren className="h-5 w-5 text-amber-300" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rules.map(({ name, trigger, icon: Icon }) => (
            <div key={name} className="rounded-lg border border-border bg-background/35 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{trigger}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
