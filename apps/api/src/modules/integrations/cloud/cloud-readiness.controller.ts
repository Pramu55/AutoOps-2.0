import type { Request, Response } from 'express';
import type { CloudProviderReadiness, CloudReadinessStatusResponse } from '@autoops/types';
import { cloudReadinessService } from './cloud-readiness.service.js';

import { getProviderInventoryBlockedStatus, requireProviderInventoryAccess } from '../integration-access.service.js';
import { withProviderReadiness } from '../provider-readiness.js';

export class CloudReadinessController {
  status = async (req: Request, res: Response<{ data: CloudReadinessStatusResponse }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      const provider = (providerKey: 'aws' | 'azure' | 'gcp', displayName: string): CloudProviderReadiness => withProviderReadiness({
        provider: providerKey,
        displayName,
        status: 'BLOCKED_BY_ORG_POLICY' as CloudProviderReadiness['status'],
        configured: false,
        checkedAt: blocked.checkedAt,
        message: blocked.message,
        safeReadChecks: [],
        writeModel: 'Provider inventory is disabled for this organization.',
      });
      res.json({
        data: {
          providers: [provider('aws', 'AWS'), provider('azure', 'Azure'), provider('gcp', 'GCP')],
          generatedAt: blocked.checkedAt,
        },
      });
      return;
    }

    const raw = await cloudReadinessService.getStatus();
    const safeProviders = raw.providers.map(p => withProviderReadiness({
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
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getAws() });
  };

  azure = async (req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getAzure() });
  };

  gcp = async (req: Request, res: Response<{ data: CloudProviderReadiness }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await cloudReadinessService.getGcp() });
  };
}

export const cloudReadinessController = new CloudReadinessController();
