import { IncidentRunbookActionType, OperationProvider, OperationType, type IncidentRunbook } from '@autoops/types';

type RunbookInput = {
  key: string | null;
  provider: OperationProvider | null;
  operationType: OperationType | null;
  operationId: string | null;
};

function action(label: string, href: string) {
  return { label, href };
}

export class IncidentRunbookService {
  getRunbook(input: RunbookInput): IncidentRunbook {
    const providerHref = this._providerHref(input.provider);
    const operationHref = input.operationId ? `/dashboard/operations/${input.operationId}` : null;
    const relatedActions = [
      ...(operationHref ? [action('View linked operation', operationHref)] : []),
      ...(providerHref ? [action('Open provider connector', providerHref)] : []),
    ];

    if (input.operationType === OperationType.JENKINS_BUILD_TRIGGER) {
      return {
        key: input.key ?? 'jenkins-build-failure',
        title: 'Jenkins build failure runbook',
        summary: 'Use Jenkins connector status and build context before deciding whether to re-run.',
        relatedActions,
        steps: [
          this._step(1, 'Check Jenkins connector health', 'Verify Jenkins is connected and build triggering remains enabled.', 'OBSERVE', 'Open Jenkins connector', '/dashboard/integrations/jenkins'),
          this._step(2, 'Review the linked operation', 'Confirm the allowlisted job, safe error summary, and governance trail.', 'VERIFY', 'View operation', operationHref),
          this._step(3, 'Retry from operation recovery', 'If the job target is valid, use the existing confirmation-gated re-run action.', 'RECOVER', 'Open recovery', operationHref),
          this._step(4, 'Escalate repeated failures', 'Escalate to the pipeline owner if repeated builds fail or Jenkins is unavailable.', 'ESCALATE'),
        ],
      };
    }

    if (input.operationType === OperationType.DOCKER_CONTAINER_RESTART) {
      return this._dockerRunbook('Docker restart failure runbook', 'docker-restart-failure', relatedActions, operationHref);
    }
    if (
      input.operationType === OperationType.DOCKER_CONTAINER_START ||
      input.operationType === OperationType.DOCKER_CONTAINER_STOP
    ) {
      return this._dockerRunbook('Docker container action failure runbook', 'docker-container-action-failure', relatedActions, operationHref);
    }

    if (input.operationType === OperationType.KUBERNETES_DEPLOYMENT_SCALE) {
      return this._kubernetesRunbook('Kubernetes scale failure runbook', 'kubernetes-scale-failure', relatedActions, operationHref);
    }
    if (input.operationType === OperationType.KUBERNETES_DEPLOYMENT_RESTART) {
      return this._kubernetesRunbook('Kubernetes rollout restart failure runbook', 'kubernetes-rollout-failure', relatedActions, operationHref);
    }

    if (
      input.operationType === OperationType.TERRAFORM_VALIDATE ||
      input.operationType === OperationType.TERRAFORM_PLAN ||
      input.operationType === OperationType.TERRAFORM_APPLY
    ) {
      return this._infrastructureRunbook(
        'Terraform/OpenTofu operation failure runbook',
        input.key ?? 'terraform-operation-failure',
        relatedActions,
        operationHref,
        'Check tool installation, allowlisted workspace path, configuration syntax, provider credentials if configured, and state lock conditions.',
      );
    }

    if (
      input.operationType === OperationType.ANSIBLE_SYNTAX_CHECK ||
      input.operationType === OperationType.ANSIBLE_CHECK ||
      input.operationType === OperationType.ANSIBLE_RUN
    ) {
      return this._infrastructureRunbook(
        'Ansible operation failure runbook',
        input.key ?? 'ansible-operation-failure',
        relatedActions,
        operationHref,
        'Check Ansible installation, allowlisted playbook path, inventory, syntax, check-mode behavior, and local permissions.',
      );
    }

    return {
      key: input.key ?? 'operation-failure',
      title: 'Operation failure runbook',
      summary: 'Review the linked operation, provider health, and safe error summary before recovery.',
      relatedActions,
      steps: [
        this._step(1, 'Review failure context', 'Open the linked operation and inspect safe governance and lifecycle details.', 'OBSERVE', 'View operation', operationHref),
        this._step(2, 'Verify provider health', 'Confirm the provider connector is available before retrying any controlled action.', 'VERIFY', 'Open Operations Hub', '/dashboard/operations'),
        this._step(3, 'Use governed recovery', 'Use only provider-specific recovery actions exposed by operation detail.', 'RECOVER', 'Open recovery', operationHref),
        this._step(4, 'Escalate if unresolved', 'Escalate to an owner or admin if the failure repeats or provider health is degraded.', 'ESCALATE'),
      ],
    };
  }

  private _dockerRunbook(
    title: string,
    key: string,
    relatedActions: IncidentRunbook['relatedActions'],
    operationHref: string | null,
  ): IncidentRunbook {
    return {
      key,
      title,
      summary: 'Use Docker connector state, recent logs, and governed recovery before resolving.',
      relatedActions,
      steps: [
        this._step(1, 'Check Docker connector health', 'Verify the Docker engine is reachable from AutoOps.', 'OBSERVE', 'Open Docker connector', '/dashboard/integrations/docker'),
        this._step(2, 'Inspect safe container state', 'Review the container card and recent safe logs on the Docker page.', 'VERIFY', 'Open Docker connector', '/dashboard/integrations/docker'),
        this._step(3, 'Review operation governance', 'Confirm the requester, policy decision, and safe error summary.', 'VERIFY', 'View operation', operationHref),
        this._step(4, 'Retry controlled action if appropriate', 'Use the existing confirmation and RBAC-gated recovery action from operation detail.', 'RECOVER', 'Open recovery', operationHref),
        this._step(5, 'Escalate repeated failure', 'Escalate if Docker remains unreachable or the target keeps failing.', 'ESCALATE'),
      ],
    };
  }

  private _kubernetesRunbook(
    title: string,
    key: string,
    relatedActions: IncidentRunbook['relatedActions'],
    operationHref: string | null,
  ): IncidentRunbook {
    return {
      key,
      title,
      summary: 'Use Kubernetes connector health, rollout status, and governed recovery before resolving.',
      relatedActions,
      steps: [
        this._step(1, 'Check Kubernetes connector health', 'Verify the cluster is reachable and namespace/workload discovery is working.', 'OBSERVE', 'Open Kubernetes connector', '/dashboard/integrations/kubernetes'),
        this._step(2, 'Verify workload target', 'Confirm the namespace and deployment still exist in the Kubernetes connector.', 'VERIFY', 'Open Kubernetes connector', '/dashboard/integrations/kubernetes'),
        this._step(3, 'Review operation detail', 'Inspect safe lifecycle, policy, and provider detail summaries.', 'VERIFY', 'View operation', operationHref),
        this._step(4, 'Retry governed recovery if safe', 'Use only exposed scale or rollout recovery actions with confirmation and RBAC checks.', 'RECOVER', 'Open recovery', operationHref),
        this._step(5, 'Escalate cluster issues', 'Escalate if the API server, rollout, or workload remains unavailable.', 'ESCALATE'),
      ],
    };
  }

  private _infrastructureRunbook(
    title: string,
    key: string,
    relatedActions: IncidentRunbook['relatedActions'],
    operationHref: string | null,
    verifyHint: string,
  ): IncidentRunbook {
    return {
      key,
      title,
      summary: 'Use Infrastructure Automation Center status and operation evidence before retrying.',
      relatedActions,
      steps: [
        this._step(1, 'Check Infrastructure Automation Center', 'Verify tool status and allowlisted workspace/playbook discovery.', 'OBSERVE', 'Open Infrastructure Center', '/dashboard/integrations/infrastructure'),
        this._step(2, 'Review operation evidence', 'Confirm requester, policy, approval, target, and safe output summary.', 'VERIFY', 'View operation', operationHref),
        this._step(3, 'Verify local automation inputs', verifyHint, 'VERIFY'),
        this._step(4, 'Retry only through governed controls', 'Use validate/plan/check before approval-gated apply/run retry.', 'RECOVER', 'Open Infrastructure Center', '/dashboard/integrations/infrastructure'),
        this._step(5, 'Escalate repeated failure', 'Escalate to an owner/admin before changing credentials, state, inventory, or cloud targets.', 'ESCALATE'),
      ],
    };
  }

  private _step(
    order: number,
    title: string,
    description: string,
    actionType: IncidentRunbookActionType,
    linkLabel?: string,
    linkHref?: string | null,
  ) {
    return {
      order,
      title,
      description,
      actionType,
      ...(linkLabel && linkHref ? { linkLabel, linkHref } : {}),
    };
  }

  private _providerHref(provider: OperationProvider | null): string | null {
    if (provider === OperationProvider.JENKINS) return '/dashboard/integrations/jenkins';
    if (provider === OperationProvider.DOCKER) return '/dashboard/integrations/docker';
    if (provider === OperationProvider.KUBERNETES) return '/dashboard/integrations/kubernetes';
    if (provider === OperationProvider.INFRASTRUCTURE) return '/dashboard/integrations/infrastructure';
    return null;
  }
}

export const incidentRunbookService = new IncidentRunbookService();
