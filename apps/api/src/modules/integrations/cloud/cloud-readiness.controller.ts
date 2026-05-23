import type { Request, Response } from 'express';
import type { CloudProviderReadiness, CloudReadinessStatusResponse } from '@autoops/types';
import { cloudReadinessService } from './cloud-readiness.service.js';

import { requireProviderInventoryAccess } from '../integration-access.service.js';

export class CloudReadinessController {
  status = async (_req: Request, res: Response<{ data: CloudReadinessStatusResponse }>): Promise<void> => {
    const raw = await cloudReadinessService.getStatus();
    const safeProviders = raw.providers.map(p => ({
      provider: p.provider,
      displayName: p.displayName,
      status: p.status,
      configured: p.configured,
      checkedAt: p.checkedAt,
      message: p.message,
    }));
    res.json({ data: { providers: safeProviders as unknown as CloudProviderReadiness[], generatedAt: raw.generatedAt } });
  };

  aws = async (req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getAws() });
  };

  azure = async (req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getAzure() });
  };

  gcp = async (req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getGcp() });
  };
}

export const cloudReadinessController = new CloudReadinessController();
