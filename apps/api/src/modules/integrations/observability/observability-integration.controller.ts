import type { Request, Response } from 'express';
import type {
  GrafanaIntegrationStatus,
  ObservabilityIntegrationStatusResponse,
  PrometheusIntegrationStatus,
} from '@autoops/types';
import { observabilityIntegrationService } from './observability-integration.service.js';

export class ObservabilityIntegrationController {
  status = async (_req: Request, res: Response<{ data: ObservabilityIntegrationStatusResponse }>): Promise<void> => {
    res.json({ data: await observabilityIntegrationService.getStatus() });
  };

  prometheus = async (_req: Request, res: Response<{ data: PrometheusIntegrationStatus }>): Promise<void> => {
    res.json({ data: await observabilityIntegrationService.getPrometheus() });
  };

  grafana = async (_req: Request, res: Response<{ data: GrafanaIntegrationStatus }>): Promise<void> => {
    res.json({ data: await observabilityIntegrationService.getGrafana() });
  };
}

export const observabilityIntegrationController = new ObservabilityIntegrationController();
