'use client';

import { useEffect, useState } from 'react';
import { Network, Hammer, Container, Boxes, Cloud, Github, Gauge, Wrench, RefreshCw, GitBranch } from 'lucide-react';
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
  statusDetail?: string;
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
    id: 'argocd',
    name: 'Argo CD GitOps',
    category: 'GitOps',
    href: '/dashboard/integrations/argocd',
    icon: <GitBranch className="h-5 w-5" />,
    purpose: 'Read-only application sync, health, and drift visibility.',
    setupGuidance: 'Configure ARGOCD_URL and read-only Argo CD credentials.',
    safetyMode: 'Read Only',
    endpoint: '/v1/integrations/argocd/status',
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
  const [statusDetails, setStatusDetails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStatuses = async (initial = false) => {
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);

    const newStatuses: Record<string, string> = {};
    const newStatusDetails: Record<string, string> = {};

    await Promise.allSettled(
      PROVIDERS.map(async (provider) => {
        try {
          const res = await api.get<unknown>(provider.endpoint);

          let status = 'UNKNOWN';
          let statusDetail: string | undefined;
          if (isRecord(res)) {
            const dataObj = res.data;
            if (isRecord(dataObj)) {
              const dataStatus = getString(dataObj, 'status');
              statusDetail = dataStatus;
              if (dataStatus) {
                status = dataStatus;
              }
              const readiness = dataObj.readiness;
              if (isRecord(readiness)) {
                status = getString(readiness, 'state') ?? status;
              }
            } else {
              const resStatus = getString(res, 'status');
              statusDetail = resStatus;
              if (resStatus) {
                status = resStatus;
              }
            }
          }

          newStatuses[provider.id] = status;
          if (statusDetail) newStatusDetails[provider.id] = statusDetail;
        } catch (error: unknown) {
          if (error instanceof ApiError && error.status === 403) {
            newStatuses[provider.id] = 'DISABLED';
            newStatusDetails[provider.id] = 'BLOCKED_BY_ORG_POLICY';
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

          const fallbackStatus = extractedStatus ?? 'NOT_CONFIGURED';
          newStatuses[provider.id] =
            fallbackStatus === 'BLOCKED_BY_ORG_POLICY' ? 'DISABLED' : fallbackStatus;
          if (extractedStatus) newStatusDetails[provider.id] = extractedStatus;
        }
      })
    );

    setStatuses(newStatuses);
    setStatusDetails(newStatusDetails);
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

      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-10">
        {isLoading ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading integrations...
          </div>
        ) : (
          [
            {
              name: 'Runtime & Orchestration',
              ids: ['docker', 'kubernetes'],
            },
            {
              name: 'CI/CD & Infrastructure',
              ids: ['jenkins', 'infrastructure'],
            },
            {
              name: 'Cloud & Core Platforms',
              ids: ['aws', 'cloud'],
            },
            {
              name: 'Telemetry & Local Tooling',
              ids: ['observability', 'github-actions', 'argocd', 'devops-tools'],
            },
          ].map((group) => {
            const groupProviders = PROVIDERS.filter((p) => group.ids.includes(p.id));
            if (groupProviders.length === 0) return null;
            return (
              <section key={group.name} className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h2 className="text-base font-semibold text-slate-800 tracking-tight">
                    {group.name}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {groupProviders.map((provider) => (
                    <ProviderStateCard
                      key={provider.id}
                      name={provider.name}
                      category={provider.category}
                      status={statuses[provider.id] || 'NOT_CONFIGURED'}
                      statusDetail={statusDetails[provider.id]}
                      safetyMode={provider.safetyMode}
                      purpose={provider.purpose}
                      setupGuidance={provider.setupGuidance}
                      href={provider.href}
                      icon={provider.icon}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
