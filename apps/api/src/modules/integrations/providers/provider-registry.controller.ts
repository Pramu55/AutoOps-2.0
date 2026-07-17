import type { Request, Response } from 'express';
import type { IntegrationProvider } from '@autoops/types';
import { getProviderInventoryBlockedStatus } from '../integration-access.service.js';
import { providerRegistryService } from './provider-registry.service.js';

export class ProviderRegistryController {
  list = async (req: Request, res: Response<{ data: IntegrationProvider[] }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({ data: providerRegistryService.listBlockedProviders(blocked) });
      return;
    }

    res.json({ data: await providerRegistryService.listProviders() });
  };
}

export const providerRegistryController = new ProviderRegistryController();
