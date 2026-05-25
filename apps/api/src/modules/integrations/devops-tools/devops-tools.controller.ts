import type { Request, Response } from 'express';
import type { DevOpsToolsStatusResponse } from '@autoops/types';
import { devOpsToolsService } from './devops-tools.service.js';
import { getProviderInventoryBlockedStatus } from '../integration-access.service.js';

export class DevOpsToolsController {
  status = async (req: Request, res: Response<{ data: DevOpsToolsStatusResponse }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({
        data: {
          status: blocked.status,
          configured: blocked.configured,
          providerInventoryEnabled: blocked.providerInventoryEnabled,
          message: blocked.message,
          remediation: blocked.remediation,
          tools: [],
          generatedAt: blocked.checkedAt,
        },
      });
      return;
    }

    res.json({ data: await devOpsToolsService.getStatus() });
  };
}

export const devOpsToolsController = new DevOpsToolsController();
