'use client';

import { useEffect, useState } from 'react';
import { Network, Hammer, Container, Boxes, Cloud, Github, Gauge, Wrench, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { ProviderStateCard } from '@/components/layout/provider-state-card';
import { Button } from '@/components/ui/button';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string | undefined {
  if (isRecord(value) && typeof value[key] === 'string') {
    return value[key];
  }
  return undefined;
}

interface ProviderStatus {
  id: string;
  name: string;
  category: string;
  href: string;
  icon: React.ReactNode;
  purpose: string;
  setupGuidance: string;
  safetyMode: string;
  endpoint: string;
  status: string;
}

const PROVIDERS: Omit<ProviderStatus, 'status'>[] = [
  {
    id: 'jenkins',
    name: 'Jenkins Control Connector',
    category: 'CI/CD Pipeline',
    href: '/dashboard/integrations/jenkins',
    icon: <Hammer className="h-5 w-5" />,
    purpose: 'Controlled Jenkins job execution and build visibility.',
    setupGuidance: 'Configure JENKINS_URL, JENKINS_USERNAME, and JENKINS_API_TOKEN.',
    safetyMode: 'Controlled Mode (Read/Trigger Only)',
    endpoint: '/v1/integrations/jenkins/status',
  },
  {
    id: 'docker',
    name: 'Docker Control Connector',
    category: 'Container Runtime',
    href: '/dashboard/integrations/docker',
    icon: <Container className="h-5 w-5" />,
    purpose: 'Governed container lifecycle management and logging.',
    setupGuidance: 'Configure DOCKER_HOST for remote API access or mount local socket.',
    safetyMode: 'Governed Execution',
    endpoint: '/v1/integrations/docker/status',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes Control Connector',
    category: 'Orchestration',
    href: '/dashboard/integrations/kubernetes',
    icon: <Boxes className="h-5 w-5" />,
    purpose: 'Workload scale and rollout control across namespaces.',
    setupGuidance: 'Configure KUBECONFIG or provide in-cluster RBAC.',
    safetyMode: 'Namespace Scoped',
    endpoint: '/v1/integrations/kubernetes/status',
  },
  {
    id: 'aws',
    name: 'AWS Deployments',
    category: 'Cloud Provider',
    href: '/dashboard/integrations/aws',
    icon: <Cloud className="h-5 w-5" />,
    purpose: 'Governed ECS Fargate and ECR image deployments.',
    setupGuidance: 'Configure AWS credentials with assume-role trust.',
    safetyMode: 'Role Restricted',
    endpoint: '/v1/integrations/aws/status',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    category: 'Source Control',
    href: '/dashboard/integrations/github-actions',
    icon: <Github className="h-5 w-5" />,
    purpose: 'Read-only workflow and release gate status sync.',
    setupGuidance: 'Configure GITHUB_TOKEN or App installation.',
    safetyMode: 'Read Only',
    endpoint: '/v1/integrations/github-actions/status',
  },
  {
    id: 'observability',
    name: 'Observability Integrations',
    category: 'Telemetry',
    href: '/dashboard/integrations/observability',
    icon: <Gauge className="h-5 w-5" />,
    purpose: 'Prometheus metrics and Grafana dashboard embedding.',
    setupGuidance: 'Configure PROMETHEUS_URL and GRAFANA_URL.',
    safetyMode: 'Read Only',
    endpoint: '/v1/integrations/observability/status',
  },
  {
    id: 'cloud',
    name: 'Cloud Readiness',
    category: 'Cloud Inventory',
    href: '/dashboard/integrations/cloud',
    icon: <Cloud className="h-5 w-5" />,
    purpose: 'AWS, Azure, and GCP readiness checks.',
    setupGuidance: 'Configure respective cloud provider credentials.',
    safetyMode: 'Read Only',
    endpoint: '/v1/integrations/cloud/status',
  },
  {
    id: 'devops-tools',
    name: 'DevOps Tools',
    category: 'CLI Utilities',
    href: '/dashboard/integrations/devops-tools',
    icon: <Wrench className="h-5 w-5" />,
    purpose: 'Helm, Kustomize, kubectl, Terraform, and Ansible binaries.',
    setupGuidance: 'Provided by the autoops-worker container environment.',
    safetyMode: 'Local Execution',
    endpoint: '/v1/integrations/devops-tools/status',
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure Automation',
    category: 'Infrastructure as Code',
    href: '/dashboard/integrations/infrastructure',
    icon: <Wrench className="h-5 w-5" />,
    purpose: 'Terraform/OpenTofu and Ansible governed automation.',
    setupGuidance: 'Requires devops-tools binaries and repository access.',
    safetyMode: 'Governed Execution',
    endpoint: '/v1/integrations/infrastructure/status',
  },
];

export function IntegrationsHubClient() {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatuses = async (initial = false) => {
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    const newStatuses: Record<string, string> = {};

    await Promise.allSettled(
      PROVIDERS.map(async (provider) => {
        try {
          const res = await api.get<unknown>(provider.endpoint);

          let status = 'UNKNOWN';
          if (isRecord(res)) {
            const dataObj = res.data;
            if (isRecord(dataObj)) {
              const dataStatus = getString(dataObj, 'status');
              if (dataStatus) {
                status = dataStatus;
              }
            } else {
              const resStatus = getString(res, 'status');
              if (resStatus) {
                status = resStatus;
              }
            }
          }

          newStatuses[provider.id] = status;
        } catch (error: unknown) {
          if (error instanceof ApiError && error.status === 403) {
            newStatuses[provider.id] = 'BLOCKED_BY_ORG_POLICY';
            return;
          }

          let extractedStatus: string | undefined;
          if (isRecord(error)) {
            const errData = error.data;
            if (isRecord(errData)) {
              extractedStatus = getString(errData, 'status');
            } else {
              extractedStatus = getString(error, 'status');
            }
          }

          newStatuses[provider.id] = extractedStatus ?? 'NOT_CONFIGURED';
        }
      })
    );

    setStatuses(newStatuses);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    void loadStatuses(true);
  }, []);

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-10">
      <WorkspaceHeader
        title="Integrations Hub"
        purpose="Central control plane for managing integration health, configuration, and governed access to external providers."
        icon={<Network className="h-6 w-6" />}
        primaryAction={
          <Button
            type="button"
            onClick={() => void loadStatuses()}
            disabled={isLoading || isRefreshing}
            className="rounded-full bg-white text-slate-950 hover:bg-slate-200 shadow-sm border border-slate-200"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {isLoading ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading integrations...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <ProviderStateCard
                key={provider.id}
                name={provider.name}
                category={provider.category}
                status={statuses[provider.id] || 'NOT_CONFIGURED'}
                safetyMode={provider.safetyMode}
                purpose={provider.purpose}
                setupGuidance={provider.setupGuidance}
                href={provider.href}
                icon={provider.icon}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
