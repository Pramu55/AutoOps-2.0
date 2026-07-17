import type { Request, Response } from 'express';
import type { DevOpsToolsStatusResponse } from '@autoops/types';
import { DevOpsToolStatus } from '@autoops/types';
import { devOpsToolsService } from './devops-tools.service.js';
import { getProviderInventoryBlockedStatus } from '../integration-access.service.js';
import { withProviderReadiness } from '../provider-readiness.js';

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
          readiness: blocked.readiness,
          tools: [],
          generatedAt: blocked.checkedAt,
        },
      });
      return;
    }

    const status = await devOpsToolsService.getStatus();
    const hasMissingTool = status.tools.some((tool) => tool.status === DevOpsToolStatus.NOT_INSTALLED);
    res.json({
      data: {
        ...status,
        readiness: withProviderReadiness({
          status: hasMissingTool ? DevOpsToolStatus.NOT_INSTALLED : DevOpsToolStatus.CONNECTED,
          configured: !hasMissingTool,
          checkedAt: status.generatedAt,
          message: hasMissingTool
            ? 'One or more DevOps tools are not installed in this runtime.'
            : 'All DevOps tools are available in this runtime.',
        }).readiness,
      },
    });
  };
}

export const devOpsToolsController = new DevOpsToolsController();
