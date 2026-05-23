import type { Request, Response } from 'express';
import type {
  GrafanaIntegrationStatus,
  ObservabilityIntegrationStatusResponse,
  PrometheusIntegrationStatus,
} from '@autoops/types';
import { observabilityIntegrationService } from './observability-integration.service.js';
import { requireProviderInventoryAccess } from '../integration-access.service.js';

export class ObservabilityIntegrationController {
  status = async (_req: Request, res: Response<{ data: ObservabilityIntegrationStatusResponse }>): Promise<void> => {
    const raw = await observabilityIntegrationService.getStatus();
    const safePrometheus = {
      status: raw.prometheus.status,
      configured: raw.prometheus.configured,
      checkedAt: raw.prometheus.checkedAt,
      message: raw.prometheus.message,
    };
    const safeGrafana = {
      status: raw.grafana.status,
      configured: raw.grafana.configured,
      version: raw.grafana.version,
      checkedAt: raw.grafana.checkedAt,
      message: raw.grafana.message,
    };
    res.json({
      data: {
        prometheus: safePrometheus as unknown as PrometheusIntegrationStatus,
        grafana: safeGrafana as unknown as GrafanaIntegrationStatus,
        generatedAt: raw.generatedAt
      }
    });
  };

  prometheus = async (req: Request, res: Response<{ data: PrometheusIntegrationStatus }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await observabilityIntegrationService.getPrometheus() });
  };

  grafana = async (req: Request, res: Response<{ data: GrafanaIntegrationStatus }>): Promise<void> => {
    requireProviderInventoryAccess(req.auth);
    res.json({ data: await observabilityIntegrationService.getGrafana() });
  };
}

export const observabilityIntegrationController = new ObservabilityIntegrationController();
