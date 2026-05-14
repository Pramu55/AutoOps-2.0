import type { Metadata } from 'next';
import {
  Building2,
  Cloud,
  FileClock,
  Gauge,
  KeyRound,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

export const metadata: Metadata = { title: 'Settings' };

function SettingsSection({
  title,
  description,
  icon,
  items,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <section className="glass rounded-xl p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-sm text-foreground">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Governance</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Organization governance shell for identity, policy, secrets, execution limits,
          auditability, infrastructure, and provider integrations. These are roadmap surfaces only.
        </p>
      </div>

      <SettingsSection
        title="Organization Settings"
        description="Workspace-level identity and ownership controls."
        icon={<Building2 className="h-5 w-5" />}
        items={['Organization profile', 'Default environment policy', 'Project ownership defaults', 'Notification contacts']}
      />

      <SettingsSection
        title="RBAC and Security"
        description="Prepared for roles, permissions, and security boundaries."
        icon={<ShieldCheck className="h-5 w-5" />}
        items={['Role assignments', 'Permission scopes', 'Session policy', 'Access reviews']}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SettingsSection
          title="Secrets Management Roadmap"
          description="No secret backend is implemented in this milestone."
          icon={<KeyRound className="h-5 w-5" />}
          items={['Secret references', 'Environment scoping', 'Rotation metadata', 'Access audit hooks']}
        />
        <SettingsSection
          title="Executor Limits Roadmap"
          description="Prepared for execution safety and resource controls."
          icon={<Gauge className="h-5 w-5" />}
          items={['Concurrency limits', 'Timeout policies', 'Retry budgets', 'Approval gates']}
        />
        <SettingsSection
          title="Audit Log Roadmap"
          description="Prepared for immutable operator activity history."
          icon={<FileClock className="h-5 w-5" />}
          items={['Actor metadata', 'Resource changes', 'Deployment actions', 'Policy decisions']}
        />
        <SettingsSection
          title="Terraform and IaC Roadmap"
          description="Infrastructure automation is intentionally not implemented yet."
          icon={<TerminalSquare className="h-5 w-5" />}
          items={['Workspace mapping', 'Plan review', 'Apply approvals', 'State references']}
        />
      </div>

      <SettingsSection
        title="Cloud Provider Integration Roadmap"
        description="Prepared for provider account connections after the core platform is ready."
        icon={<Cloud className="h-5 w-5" />}
        items={['AWS account link', 'GCP project link', 'Azure subscription link', 'Credential boundary policy']}
      />
    </div>
  );
}
