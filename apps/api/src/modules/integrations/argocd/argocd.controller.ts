import type { Request, Response } from 'express';
import type {
  ArgoCdApplicationsResponse,
  ArgoCdStatusResponse,
  ArgoCdSummaryResponse,
} from '@autoops/types';
import { getProviderInventoryBlockedStatus, requireProviderInventoryAccess } from '../integration-access.service.js';
import { argocdService } from './argocd.service.js';

export class ArgoCdController {
  status = async (req: Request, res: Response<{ data: ArgoCdStatusResponse }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({ data: blocked as unknown as ArgoCdStatusResponse });
      return;
    }

    const status = await argocdService.getStatus();
    res.json({ data: sanitizeStatus(status) });
  };

  applications = async (
    req: Request,
    res: Response<{ data: ArgoCdApplicationsResponse }>,
  ): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await argocdService.listApplications() });
  };

  summary = async (
    req: Request,
    res: Response<{ data: ArgoCdSummaryResponse }>,
  ): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await argocdService.getSummary() });
  };
}

function sanitizeStatus(status: ArgoCdStatusResponse): ArgoCdStatusResponse {
  return {
    status: status.status,
    configured: status.configured,
    serverUrl: status.serverUrl,
    authMode: status.authMode,
    skipTlsVerify: status.skipTlsVerify,
    checkedAt: status.checkedAt,
    message: status.message,
    providerInventoryEnabled: status.providerInventoryEnabled,
    remediation: status.remediation,
  };
}

export const argocdController = new ArgoCdController();
