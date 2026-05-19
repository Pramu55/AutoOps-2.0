import type { Metadata } from 'next';
import {
  Activity,
  BarChart3,
  CircuitBoard,
  Database,
  Gauge,
  RadioTower,
  Server,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Observability' };

function HealthCard({
  title,
  status,
  description,
  icon,
}: {
  title: string;
  status: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-lg font-semibold text-emerald-700">{status}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

export default function ObservabilityPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Health and Telemetry</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Observability</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Readiness surface for runtime health, queues, metrics, and dashboards.
          This page does not display fake live telemetry.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <HealthCard
          title="API Health"
          status="Ready surface"
          description="Prepared for the existing health-ready endpoint and request latency signals."
          icon={<Server className="h-5 w-5" />}
        />
        <HealthCard
          title="Worker Health"
          status="Ready surface"
          description="Prepared for worker runtime heartbeat and job processing status."
          icon={<CircuitBoard className="h-5 w-5" />}
        />
        <HealthCard
          title="PostgreSQL Readiness"
          status="Ready surface"
          description="Prepared for connection, migration, and query readiness checks."
          icon={<Database className="h-5 w-5" />}
        />
        <HealthCard
          title="Redis and BullMQ"
          status="Ready surface"
          description="Prepared for Redis availability, queue depth, and failed job signals."
          icon={<RadioTower className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="glass rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Gauge className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Queue Metrics Roadmap</h2>
          </div>
          <div className="mt-5 space-y-3">
            {['Waiting jobs', 'Active jobs', 'Completed jobs', 'Failed jobs', 'Retry and stalled job counts'].map((item) => (
              <div key={item} className="rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Prometheus and Grafana</h2>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Reserved for scrape target status, dashboard links, alert manager handoff,
            service-level indicators, and deployment annotations. No external metrics
            provider is wired in this frontend milestone.
          </p>
        </section>
      </div>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Deployment Metrics Roadmap</h2>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            'Lead time and deployment frequency',
            'Change failure rate and rollback rate',
            'Mean time to recovery and incident correlation',
          ].map((item) => (
            <div key={item} className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
