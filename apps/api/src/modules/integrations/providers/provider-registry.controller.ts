import type { Request, Response } from 'express';
import type { IntegrationProvider } from '@autoops/types';
import { providerRegistryService } from './provider-registry.service.js';

export class ProviderRegistryController {
  list = async (_req: Request, res: Response<{ data: IntegrationProvider[] }>): Promise<void> => {
    res.json({ data: await providerRegistryService.listProviders() });
  };
}

export const providerRegistryController = new ProviderRegistryController();
