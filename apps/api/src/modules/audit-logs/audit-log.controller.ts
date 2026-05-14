import type { Request, Response } from 'express';
import type { AuditLog } from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { auditLogService } from './audit-log.service.js';

export class AuditLogController {
  list = async (req: Request, res: Response<{ data: AuditLog[] }>): Promise<void> => {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    res.json({ data: await auditLogService.listAuditLogs(req.auth.orgId) });
  };
}

export const auditLogController = new AuditLogController();
