import type { Request, Response } from 'express';
import type { CloudProviderReadiness, CloudReadinessStatusResponse } from '@autoops/types';
import { cloudReadinessService } from './cloud-readiness.service.js';

export class CloudReadinessController {
  status = async (_req: Request, res: Response<{ data: CloudReadinessStatusResponse }>): Promise<void> => {
    res.json({ data: await cloudReadinessService.getStatus() });
  };

  aws = async (_req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    res.json({ data: await cloudReadinessService.getAws() });
  };

  azure = async (_req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    res.json({ data: await cloudReadinessService.getAzure() });
  };

  gcp = async (_req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    res.json({ data: await cloudReadinessService.getGcp() });
  };
}

export const cloudReadinessController = new CloudReadinessController();
