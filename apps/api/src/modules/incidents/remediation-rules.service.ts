import {
  IncidentSeverity,
  OperationProvider,
  OperationType,
  type IncidentDetail,
  type IncidentTimelineEventSummary,
  type RemediationEvidence,
  type RemediationRecommendation,
} from '@autoops/types';

export type RemediationRulesContext = {
  incident: IncidentDetail;
  timeline: IncidentTimelineEventSummary[];
  failedDeployments: Array<{
    id: string;
    status: string;
    errorMessage: string | null;
    branch: string | null;
    commitSha: string | null;
    imageTag: string | null;
    updatedAt: string;
    metadata: Record<string, unknown>;
  }>;
  recentOperations: Array<{
    id: string;
    provider: string;
    operationType: string;
    status: string;
    updatedAt: string;
  }>;
};

export type RemediationPreparationPlan =
  | {
      canPrepare: true;
      provider: OperationProvider;
      operationType: OperationType;
      confirmationToken: string;
      input: Record<string, unknown>;
    }
  | {
      canPrepare: false;
      blockedReason: string;
    };

const HIGH_SEVERITIES = new Set<IncidentSeverity>([
  IncidentSeverity.CRITICAL,
  IncidentSeverity.ERROR,
]);

const SENSITIVE_KEY_PATTERN = /token|secret|password|credential|authorization|apikey|api_key|private|kubeconfig/i;

export function buildRemediationRecommendations(
  context: RemediationRulesContext,
): RemediationRecommendation[] {
  const evidence = collectEvidence(context);
  const searchable = buildSearchableText(context, evidence);
  const recommendations: RemediationRecommendation[] = [];

  if (HIGH_SEVERITIES.has(context.incident.severity) && hasKubernetesEvidence(searchable)) {
    const draft = {
      id: `${context.incident.id}:kubernetes-rollout-review`,
      incidentId: context.incident.id,
      title: 'Review Kubernetes rollout restart',
      description:
        'Kubernetes workload evidence was found on a high-severity incident. Review the affected workload and use governed rollout controls only after confirming the exact namespace and deployment.',
      provider: OperationProvider.KUBERNETES,
      actionType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
      reason: 'High-severity incident evidence references Kubernetes workload health or rollout state.',
      evidence: evidence.filter((item) => evidenceMatches(item, /kubernetes|k8s|pod|deployment|workload|namespace|rollout|crashloop/i)),
      riskLevel: 'HIGH' as const,
      confirmationToken: 'ROLLOUT',
      approvalRequired: false,
      canPrepareOperation: false,
      blockedReason:
        'Preparation is disabled until AutoOps can bind verified namespace and deployment targets to a preparation-only governed operation.',
    };
    const plan = buildRemediationPreparationPlan(draft);
    recommendations.push({
      ...draft,
      canPrepareOperation: plan.canPrepare,
      blockedReason: plan.canPrepare ? undefined : plan.blockedReason,
    });
  }

  if (hasDockerFailureEvidence(searchable)) {
    const draft = {
      id: `${context.incident.id}:docker-restart-review`,
      incidentId: context.incident.id,
      title: 'Review Docker container restart',
      description:
        'Docker container failure evidence was found. Review the container and logs before requesting a governed restart.',
      provider: OperationProvider.DOCKER,
      actionType: OperationType.DOCKER_CONTAINER_RESTART,
      reason: 'Incident evidence references Docker container health, exit, restart, or failure states.',
      evidence: evidence.filter((item) => evidenceMatches(item, /docker|container|unhealthy|restart|exited|exit|failed|failure/i)),
      riskLevel: 'MEDIUM' as const,
      confirmationToken: 'RESTART',
      approvalRequired: true,
      canPrepareOperation: false,
      blockedReason:
        'Preparation is disabled until the incident evidence contains a verified container identifier and a preparation-only operation path.',
    };
    const plan = buildRemediationPreparationPlan(draft);
    recommendations.push({
      ...draft,
      canPrepareOperation: plan.canPrepare,
      blockedReason: plan.canPrepare ? undefined : plan.blockedReason,
    });
  }

  if (hasCiOrDeploymentFailure(context, searchable)) {
    const draft = {
      id: `${context.incident.id}:ci-deployment-investigation`,
      incidentId: context.incident.id,
      title: 'Investigate failed deployment or CI evidence',
      description:
        'Deployment or build failure evidence was found. Review the failed release evidence and trigger only allowlisted CI jobs through the governed connector.',
      provider: OperationProvider.JENKINS,
      actionType: OperationType.JENKINS_BUILD_TRIGGER,
      reason: 'The incident is linked to failed deployment, Jenkins, CI, build, or pipeline evidence.',
      evidence: evidence.filter((item) => evidenceMatches(item, /deployment|build|jenkins|ci|pipeline|failed|failure/i)),
      riskLevel: 'MEDIUM' as const,
      confirmationToken: 'BUILD',
      approvalRequired: false,
      canPrepareOperation: false,
      blockedReason:
        'A Jenkins operation requires a verified allowlisted job name, which is not safely derivable from incident evidence alone.',
    };
    const plan = buildRemediationPreparationPlan(draft);
    recommendations.push({
      ...draft,
      canPrepareOperation: plan.canPrepare,
      blockedReason: plan.canPrepare ? undefined : plan.blockedReason,
    });
  }

  if (hasPolicyOrGitOpsEvidence(searchable)) {
    const gitOps = /argo|gitops/.test(searchable);
    recommendations.push({
      id: `${context.incident.id}:policy-gitops-review`,
      incidentId: context.incident.id,
      title: gitOps ? 'Review GitOps evidence' : 'Review policy evidence',
      description:
        'Policy, GitOps, or Argo evidence was found. This recommendation is review-only and does not prepare a mutating operation.',
      provider: gitOps ? 'GITOPS' : 'POLICY',
      actionType: gitOps ? 'REVIEW_GITOPS' : 'REVIEW_POLICY',
      reason: 'The evidence references policy, GitOps, Argo, admission control, or drift boundaries.',
      evidence: evidence.filter((item) => evidenceMatches(item, /policy|opa|gitops|argo|admission|drift/i)),
      riskLevel: 'LOW',
      confirmationToken: null,
      approvalRequired: false,
      canPrepareOperation: false,
      blockedReason: 'Review-only recommendation; no governed mutation is attached to this rule.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: `${context.incident.id}:investigation-only`,
      incidentId: context.incident.id,
      title: 'No safe automated remediation recommendation',
      description:
        'AutoOps did not find deterministic evidence for a governed remediation action. Continue investigation using timeline evidence, linked signals, provider health, and the operations view.',
      provider: 'AUTOOPS',
      actionType: 'INVESTIGATE',
      reason: 'No Kubernetes, Docker, CI/deployment, policy, GitOps, or Argo remediation rule matched current evidence.',
      evidence: evidence.slice(0, 8),
      riskLevel: 'LOW',
      confirmationToken: null,
      approvalRequired: false,
      canPrepareOperation: false,
      blockedReason: 'No safe action exists for the current evidence.',
    });
  }

  return recommendations.map((recommendation) => ({
    ...recommendation,
    evidence: recommendation.evidence.slice(0, 8),
  }));
}

export function buildRemediationPreparationPlan(
  recommendation: RemediationRecommendation,
): RemediationPreparationPlan {
  if (
    recommendation.provider === OperationProvider.DOCKER &&
    recommendation.actionType === OperationType.DOCKER_CONTAINER_RESTART
  ) {
    const containerId = firstEvidenceString(recommendation, ['containerId', 'id']);
    if (!containerId) {
      return {
        canPrepare: false,
        blockedReason:
          'Preparation is disabled until the incident evidence contains a verified Docker container identifier.',
      };
    }

    return {
      canPrepare: true,
      provider: OperationProvider.DOCKER,
      operationType: OperationType.DOCKER_CONTAINER_RESTART,
      confirmationToken: 'RESTART',
      input: compactRecord({
        action: 'restart',
        containerId,
        containerName: firstEvidenceString(recommendation, ['containerName', 'name']),
        image: firstEvidenceString(recommendation, ['image']),
        confirmationLabel: 'RESTART',
        preparedFromIncidentId: recommendation.incidentId,
        remediationRecommendationId: recommendation.id,
      }),
    };
  }

  if (
    recommendation.provider === OperationProvider.KUBERNETES &&
    recommendation.actionType === OperationType.KUBERNETES_DEPLOYMENT_RESTART
  ) {
    const namespace = firstEvidenceString(recommendation, ['namespace']);
    const name = firstEvidenceString(recommendation, ['deploymentName', 'workloadName']);
    if (!namespace || !name) {
      return {
        canPrepare: false,
        blockedReason:
          'Preparation is disabled until the incident evidence contains both verified Kubernetes namespace and deployment target fields.',
      };
    }

    return {
      canPrepare: true,
      provider: OperationProvider.KUBERNETES,
      operationType: OperationType.KUBERNETES_DEPLOYMENT_RESTART,
      confirmationToken: 'ROLLOUT',
      input: {
        action: 'rolloutRestart',
        namespace,
        name,
        preparedFromIncidentId: recommendation.incidentId,
        remediationRecommendationId: recommendation.id,
      },
    };
  }

  if (
    recommendation.provider === OperationProvider.JENKINS &&
    recommendation.actionType === OperationType.JENKINS_BUILD_TRIGGER
  ) {
    const jobName = firstEvidenceString(recommendation, ['jobName', 'job', 'fullName']);
    if (!jobName) {
      return {
        canPrepare: false,
        blockedReason:
          'A Jenkins operation requires a verified allowlisted job name, which is not safely derivable from incident evidence alone.',
      };
    }

    return {
      canPrepare: true,
      provider: OperationProvider.JENKINS,
      operationType: OperationType.JENKINS_BUILD_TRIGGER,
      confirmationToken: 'BUILD',
      input: {
        jobName,
        parameters: {},
        preparedFromIncidentId: recommendation.incidentId,
        remediationRecommendationId: recommendation.id,
      },
    };
  }

  return {
    canPrepare: false,
    blockedReason: recommendation.blockedReason ?? 'No governed operation is attached to this recommendation.',
  };
}

function collectEvidence(context: RemediationRulesContext): RemediationEvidence[] {
  return [
    {
      source: 'incident',
      sourceId: context.incident.id,
      type: context.incident.status,
      label: context.incident.title,
      occurredAt: context.incident.openedAt,
      details: safeDetails({
        severity: context.incident.severity,
        source: context.incident.source,
        summary: context.incident.summary,
        correlationKey: context.incident.correlationKey,
      }),
    },
    ...context.incident.evidence.map((signal): RemediationEvidence => ({
      source: 'signal',
      sourceId: signal.signalId,
      type: signal.type,
      label: signal.title,
      occurredAt: signal.observedAt,
      details: safeDetails({
        role: signal.role,
        severity: signal.severity,
      }),
    })),
    ...context.timeline.map((event): RemediationEvidence => ({
      source: 'timeline',
      sourceId: event.id,
      type: event.type,
      label: event.title,
      occurredAt: event.occurredAt,
      details: safeDetails({
        source: event.source,
        status: event.status,
        severity: event.severity,
        message: event.message,
        ...event.metadata,
      }),
    })),
    ...context.failedDeployments.map((deployment): RemediationEvidence => ({
      source: 'deployment',
      sourceId: deployment.id,
      type: deployment.status,
      label: deployment.errorMessage ?? `Deployment ${deployment.status.toLowerCase()}`,
      occurredAt: deployment.updatedAt,
      details: safeDetails({
        branch: deployment.branch,
        commitSha: deployment.commitSha,
        imageTag: deployment.imageTag,
        ...deployment.metadata,
      }),
    })),
    ...context.recentOperations.map((operation): RemediationEvidence => ({
      source: 'operation',
      sourceId: operation.id,
      type: operation.operationType,
      label: `${operation.provider} ${operation.status}`,
      occurredAt: operation.updatedAt,
      details: safeDetails({
        provider: operation.provider,
        status: operation.status,
      }),
    })),
  ];
}

function buildSearchableText(
  context: RemediationRulesContext,
  evidence: RemediationEvidence[],
): string {
  return [
    context.incident.title,
    context.incident.summary,
    context.incident.correlationKey,
    ...evidence.flatMap((item) => [
      item.type,
      item.label,
      JSON.stringify(item.details ?? {}),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasKubernetesEvidence(text: string): boolean {
  return /kubernetes|k8s|pod|deployment|workload|namespace|rollout|crashloop/.test(text);
}

function hasDockerFailureEvidence(text: string): boolean {
  return /docker|container/.test(text) && /unhealthy|restart|exited|exit|failed|failure|oom|crash/.test(text);
}

function hasCiOrDeploymentFailure(context: RemediationRulesContext, text: string): boolean {
  return context.failedDeployments.length > 0 || /jenkins|ci|build|pipeline|deployment failed|deploy failed/.test(text);
}

function hasPolicyOrGitOpsEvidence(text: string): boolean {
  return /policy|opa|gitops|argo|admission|drift/.test(text);
}

function evidenceMatches(evidence: RemediationEvidence, pattern: RegExp): boolean {
  return pattern.test(`${evidence.type} ${evidence.label} ${JSON.stringify(evidence.details ?? {})}`);
}

function safeDetails(value: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, safeValue(item)])
      .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined),
  );
}

function safeValue(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return JSON.stringify(value.slice(0, 8).map(safeValue));
  if (typeof value === 'object') return JSON.stringify(safeDetails(value as Record<string, unknown>));
  return String(value);
}

function firstEvidenceString(recommendation: RemediationRecommendation, keys: string[]): string | null {
  for (const evidence of recommendation.evidence) {
    for (const key of keys) {
      const value = evidence.details?.[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
  }
  return null;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''),
  );
}
