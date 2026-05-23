import type { Request, Response } from 'express';
import {
  OperationType,
  type AnsibleOperationResponse,
  type AnsiblePlaybookSummary,
  type InfrastructureAutomationSummaryResponse,
  type InfrastructureProviderStatus,
  type TerraformOperationResponse,
  type TerraformWorkspaceSummary,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { infrastructureService } from './infrastructure.service.js';
import { requireProviderInventoryAccess } from '../integration-access.service.js';

type TerraformParams = { workspaceSlug: string };
type AnsibleParams = { playbookSlug: string };
type ConfirmationBody = { confirmationToken: string };

export class InfrastructureController {
  status = async (_req: Request, res: Response<{ data: InfrastructureProviderStatus }>): Promise<void> => {
    res.json({ data: await infrastructureService.getStatus() });
  };

  summary = async (req: Request, res: Response<{ data: InfrastructureAutomationSummaryResponse }>): Promise<void> => {
    const auth = this._requireAuth(req);
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await infrastructureService.getSummary(auth.orgId) });
  };

  terraformWorkspaces = async (req: Request, res: Response<{ data: { items: TerraformWorkspaceSummary[] } }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: { items: await infrastructureService.listTerraformWorkspaces() } });
  };

  ansiblePlaybooks = async (req: Request, res: Response<{ data: { items: AnsiblePlaybookSummary[] } }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: { items: await infrastructureService.listAnsiblePlaybooks() } });
  };

  terraformValidate = async (
    req: Request<TerraformParams, unknown, ConfirmationBody>,
    res: Response<{ data: TerraformOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestTerraformOperation(
      req.params.workspaceSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.TERRAFORM_VALIDATE,
        action: 'validate',
        confirmationToken: 'VALIDATE',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  terraformPlan = async (
    req: Request<TerraformParams, unknown, ConfirmationBody>,
    res: Response<{ data: TerraformOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestTerraformOperation(
      req.params.workspaceSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.TERRAFORM_PLAN,
        action: 'plan',
        confirmationToken: 'PLAN',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  terraformApply = async (
    req: Request<TerraformParams, unknown, ConfirmationBody>,
    res: Response<{ data: TerraformOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestTerraformOperation(
      req.params.workspaceSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.TERRAFORM_APPLY,
        action: 'apply',
        confirmationToken: 'APPLY',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  ansibleSyntaxCheck = async (
    req: Request<AnsibleParams, unknown, ConfirmationBody>,
    res: Response<{ data: AnsibleOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestAnsibleOperation(
      req.params.playbookSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.ANSIBLE_SYNTAX_CHECK,
        action: 'syntax-check',
        confirmationToken: 'SYNTAX',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  ansibleCheck = async (
    req: Request<AnsibleParams, unknown, ConfirmationBody>,
    res: Response<{ data: AnsibleOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestAnsibleOperation(
      req.params.playbookSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.ANSIBLE_CHECK,
        action: 'check',
        confirmationToken: 'CHECK',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  ansibleRun = async (
    req: Request<AnsibleParams, unknown, ConfirmationBody>,
    res: Response<{ data: AnsibleOperationResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const data = await infrastructureService.requestAnsibleOperation(
      req.params.playbookSlug,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.confirmationToken,
      {
        operationType: OperationType.ANSIBLE_RUN,
        action: 'run',
        confirmationToken: 'RUN',
      },
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  private _requireAuth(req: Request): { userId: string; orgId: string; role?: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { userId: req.auth.userId, orgId: req.auth.orgId, role: req.auth.role };
  }

  private _auditContext(req: Request): { ipAddress?: string; userAgent?: string } {
    return {
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    };
  }
}

export const infrastructureController = new InfrastructureController();
