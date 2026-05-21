import type { Request, Response } from 'express';
import type { DevOpsToolsStatusResponse } from '@autoops/types';
import { devOpsToolsService } from './devops-tools.service.js';

export class DevOpsToolsController {
  status = async (_req: Request, res: Response<{ data: DevOpsToolsStatusResponse }>): Promise<void> => {
    res.json({ data: await devOpsToolsService.getStatus() });
  };
}

export const devOpsToolsController = new DevOpsToolsController();
