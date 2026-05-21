import { prisma, type Prisma } from '@autoops/database';
import {
  InfrastructureOperationKind,
  OperationProvider,
  OperationStatus,
  OperationType,
  type AnsibleOperationResponse,
  type AnsiblePlaybookSummary,
  type InfrastructureAutomationSummaryResponse,
  type InfrastructureProviderStatus,
  type InfrastructureToolStatus,
  type TerraformOperationResponse,
  type TerraformWorkspaceSummary,
} from '@autoops/types';
import {
  BadRequestError,
  NotFoundError,
  detectAnsibleTool,
  detectTerraformTool,
  getAnsiblePlaybookBySlug,
  getTerraformWorkspaceBySlug,
  listAnsiblePlaybooks,
  listTerraformWorkspaces,
} from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';

type AuditContext = { ipAddress?: string; userAgent?: string };

type ActionConfig = {
  operationType: OperationType;
  action: string;
  confirmationToken: string;
};

export class InfrastructureService {
  async getStatus(): Promise<InfrastructureProviderStatus> {
    const [terraform, ansible] = await Promise.all([detectTerraformTool(), detectAnsibleTool()]);
    return {
      terraform: this._toolStatus(terraform),
      ansible: this._toolStatus(ansible),
    };
  }

  async getSummary(organizationId: string): Promise<InfrastructureAutomationSummaryResponse> {
    const [status, terraformWorkspaces, ansiblePlaybooks, operations] = await Promise.all([
      this.getStatus(),
      this.listTerraformWorkspaces(),
      this.listAnsiblePlaybooks(),
      prisma.operation.findMany({
        where: {
          organizationId,
          provider: OperationProvider.INFRASTRUCTURE,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          operationType: true,
          status: true,
          input: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      status,
      terraformWorkspaces,
      ansiblePlaybooks,
      recentOperations: operations.map((operation) => {
        const input = this._toRecord(operation.input);
        const policy = this._toRecord(input.policy);
        const risk = policy.riskLevel;
        return {
          operationId: operation.id,
          kind: operation.operationType as InfrastructureOperationKind,
          status: operation.status,
          target:
            this._string(input, 'workspaceSlug') ??
            this._string(input, 'playbookSlug') ??
            this._string(input, 'relativePath'),
          riskLevel: risk === 'LOW' || risk === 'MEDIUM' || risk === 'HIGH' ? risk : 'LOW',
          approvalRequired: policy.approvalRequired === true,
          createdAt: operation.createdAt.toISOString(),
        };
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  async listTerraformWorkspaces(): Promise<TerraformWorkspaceSummary[]> {
    const [status, workspaces] = await Promise.all([detectTerraformTool(), listTerraformWorkspaces()]);
    return workspaces.map((workspace) => ({
      slug: workspace.slug,
      displayName: workspace.displayName,
      relativePath: workspace.relativePath,
      tool: status.status === 'CONNECTED' && (status.tool === 'terraform' || status.tool === 'tofu') ? status.tool : null,
      status: status.status,
      version: status.version,
      lastCheckedAt: status.checkedAt,
      allowedActions: ['validate', 'plan', 'apply'],
      requiresApproval: {
        validate: false,
        plan: false,
        apply: true,
      },
    }));
  }

  async listAnsiblePlaybooks(): Promise<AnsiblePlaybookSummary[]> {
    const [status, playbooks] = await Promise.all([detectAnsibleTool(), listAnsiblePlaybooks()]);
    return playbooks.map((playbook) => ({
      slug: playbook.slug,
      displayName: playbook.displayName,
      relativePath: playbook.relativePath,
      inventoryRelativePath: playbook.inventoryRelativePath,
      status: status.status,
      version: status.version,
      lastCheckedAt: status.checkedAt,
      allowedActions: ['syntax-check', 'check', 'run'],
      requiresApproval: {
        syntaxCheck: false,
        check: false,
        run: true,
      },
    }));
  }

  async requestTerraformOperation(
    workspaceSlug: string,
    organizationId: string,
    userId: string,
    role: string | undefined,
    confirmationToken: string,
    config: ActionConfig,
    auditContext: AuditContext,
  ): Promise<TerraformOperationResponse> {
    if (confirmationToken !== config.confirmationToken) {
      throw new BadRequestError(`confirmationToken must be ${config.confirmationToken}`);
    }

    const toolStatus = await detectTerraformTool();
    if (toolStatus.status !== 'CONNECTED') {
      throw new BadRequestError(toolStatus.message);
    }

    const workspace = await getTerraformWorkspaceBySlug(workspaceSlug);
    if (!workspace) throw new NotFoundError('Terraform workspace');

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.INFRASTRUCTURE,
        operationType: config.operationType,
        confirmationToken,
        idempotencyKey: `iac-terraform-${config.action}-${workspace.slug}-${Date.now()}`,
        input: {
          tool: toolStatus.tool,
          action: config.action,
          workspaceSlug: workspace.slug,
          displayName: workspace.displayName,
          relativePath: workspace.relativePath,
          commandSummary: `${toolStatus.tool} ${config.action}`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      auditContext,
    );

    return this._operationResponse(operation, `Terraform ${config.action} operation`);
  }

  async requestAnsibleOperation(
    playbookSlug: string,
    organizationId: string,
    userId: string,
    role: string | undefined,
    confirmationToken: string,
    config: ActionConfig,
    auditContext: AuditContext,
  ): Promise<AnsibleOperationResponse> {
    if (confirmationToken !== config.confirmationToken) {
      throw new BadRequestError(`confirmationToken must be ${config.confirmationToken}`);
    }

    const toolStatus = await detectAnsibleTool();
    if (toolStatus.status !== 'CONNECTED') {
      throw new BadRequestError(toolStatus.message);
    }

    const playbook = await getAnsiblePlaybookBySlug(playbookSlug);
    if (!playbook) throw new NotFoundError('Ansible playbook');

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.INFRASTRUCTURE,
        operationType: config.operationType,
        confirmationToken,
        idempotencyKey: `iac-ansible-${config.action}-${playbook.slug}-${Date.now()}`,
        input: {
          tool: 'ansible-playbook',
          action: config.action,
          playbookSlug: playbook.slug,
          displayName: playbook.displayName,
          relativePath: playbook.relativePath,
          inventoryRelativePath: playbook.inventoryRelativePath,
          commandSummary: `ansible-playbook ${config.action}`,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonObject,
      },
      auditContext,
    );

    return this._operationResponse(operation, `Ansible ${config.action} operation`);
  }

  private _operationResponse(
    operation: Awaited<ReturnType<typeof operationService.createQueuedOperation>>,
    label: string,
  ): TerraformOperationResponse {
    const policy = this._toRecord(operation.input.policy);
    const risk = policy.riskLevel;
    return {
      operationId: operation.id,
      status: operation.status,
      approvalRequired: operation.status === OperationStatus.PENDING_APPROVAL,
      approvalReason: this._string(policy, 'approvalReason'),
      riskLevel: risk === 'LOW' || risk === 'MEDIUM' || risk === 'HIGH' ? risk : 'LOW',
      policyName: this._string(policy, 'policyName'),
      message:
        operation.status === OperationStatus.PENDING_APPROVAL
          ? `${label} submitted for approval.`
          : `${label} queued for worker execution.`,
    };
  }

  private _toolStatus(status: Awaited<ReturnType<typeof detectTerraformTool>>): InfrastructureToolStatus {
    return {
      status: status.status,
      configured: status.configured,
      tool: status.tool,
      version: status.version,
      checkedAt: status.checkedAt,
      message: status.message,
    };
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private _string(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }
}

export const infrastructureService = new InfrastructureService();
