import type { Request, Response } from 'express';
import type { Operation } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { operationService } from './operation.service.js';

type OperationParams = {
  operationId: string;
};

type DecisionBody = {
  reason?: string;
};

export class OperationController {
  list = async (req: Request, res: Response<{ data: Operation[] }>): Promise<void> => {
    const auth = this._requireAuth(req);
    res.json({ data: await operationService.listOperations(auth.orgId) });
  };

  get = async (req: Request<OperationParams>, res: Response<{ data: Operation }>): Promise<void> => {
    const auth = this._requireAuth(req);
    res.json({ data: await operationService.getOperation(req.params.operationId, auth.orgId) });
  };

  approve = async (
    req: Request<OperationParams, unknown, DecisionBody>,
    res: Response<{ data: Operation }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const operation = await operationService.approveOperation(
      req.params.operationId,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.reason,
      this._auditContext(req),
    );
    res.json({ data: operation });
  };

  reject = async (
    req: Request<OperationParams, unknown, DecisionBody>,
    res: Response<{ data: Operation }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    const operation = await operationService.rejectOperation(
      req.params.operationId,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body.reason,
      this._auditContext(req),
    );
    res.json({ data: operation });
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

export const operationController = new OperationController();
