import type { Request, Response } from 'express';
import type {
  KubernetesListResponse,
  KubernetesNamespace,
  KubernetesPod,
  KubernetesApplyDryRunResult,
  KubernetesActionResponse,
  KubernetesNode,
  KubernetesRolloutRestartDeploymentInput,
  KubernetesRestartDeploymentInput,
  KubernetesApplyManifestInput,
  KubernetesRolloutStatus,
  KubernetesScaleDeploymentInput,
  KubernetesService as KubernetesServiceDto,
  KubernetesStatus,
  KubernetesSummary,
  KubernetesWorkload,
  Operation,
} from '@autoops/types';
import { UnauthenticatedError, UnauthorizedError } from '@autoops/utils';
import { kubernetesService } from './kubernetes.service.js';
import { getProviderInventoryBlockedStatus, requireProviderInventoryAccess } from '../integration-access.service.js';
import { resourceGraphService } from '../../resources/resource-graph.service.js';

type WorkloadParams = {
  namespace: string;
  name: string;
};

export class KubernetesController {
  status = async (req: Request, res: Response<{ data: KubernetesStatus }>): Promise<void> => {
    const blocked = await getProviderInventoryBlockedStatus(req.auth);
    if (blocked) {
      res.json({ data: { ...blocked, readOnly: true } as unknown as KubernetesStatus });
      return;
    }

    const raw = await kubernetesService.getStatus();
    const safeStatus = {
      status: raw.status,
      version: raw.version,
      readOnly: raw.readOnly,
      checkedAt: raw.checkedAt,
      message: raw.message,
    };
    res.json({ data: safeStatus as unknown as KubernetesStatus });
  };

  summary = async (req: Request, res: Response<{ data: KubernetesSummary }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await kubernetesService.getSummary() });
  };

  namespaces = async (
    req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesNamespace> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.listNamespaces();
    await this._registerKubernetes(auth.orgId, { namespaces: data.items });
    res.json({ data });
  };

  workloads = async (
    req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesWorkload> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.listWorkloads();
    await this._registerKubernetes(auth.orgId, { workloads: data.items });
    res.json({ data });
  };

  pods = async (
    req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesPod> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.listPods();
    await this._registerKubernetes(auth.orgId, { pods: data.items });
    res.json({ data });
  };

  services = async (
    req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesServiceDto> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.listServices();
    await this._registerKubernetes(auth.orgId, { services: data.items });
    res.json({ data });
  };

  nodes = async (
    req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesNode> }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.listNodes();
    await this._registerKubernetes(auth.orgId, { nodes: data.items });
    res.json({ data });
  };

  rolloutStatus = async (
    req: Request<WorkloadParams>,
    res: Response<{ data: KubernetesRolloutStatus }>,
  ): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({
      data: await kubernetesService.getRolloutStatus(req.params.namespace, req.params.name),
    });
  };

  restartDeployment = async (
    req: Request<WorkloadParams, unknown, KubernetesRestartDeploymentInput>,
    res: Response<{ data: Operation }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const operation = await kubernetesService.requestDeploymentRestart(
      req.params.namespace,
      req.params.name,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body,
      this._auditContext(req),
    );
    res.status(202).json({ data: operation });
  };

  scaleDeployment = async (
    req: Request<WorkloadParams, unknown, KubernetesScaleDeploymentInput>,
    res: Response<{ data: KubernetesActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.requestDeploymentScale(
      req.params.namespace,
      req.params.name,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body,
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  rolloutRestartDeployment = async (
    req: Request<WorkloadParams, unknown, KubernetesRolloutRestartDeploymentInput>,
    res: Response<{ data: KubernetesActionResponse }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const data = await kubernetesService.requestDeploymentRolloutRestart(
      req.params.namespace,
      req.params.name,
      auth.orgId,
      auth.userId,
      auth.role,
      req.body,
      this._auditContext(req),
    );
    res.status(202).json({ data });
  };

  applyManifest = async (
    req: Request<Record<string, never>, unknown, KubernetesApplyManifestInput>,
    res: Response<{ data: KubernetesApplyDryRunResult | Operation }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
    await requireProviderInventoryAccess(req.auth);
    const result = await kubernetesService.applyManifest(
      auth.orgId,
      auth.userId,
      auth.role,
      req.body,
      this._auditContext(req),
    );
    res.status(req.body.dryRun === false ? 202 : 200).json({ data: result });
  };

  private _requireAuth(req: Request): { userId: string; orgId: string; role?: string } {
    if (!req.auth) throw new UnauthenticatedError();
    if (!req.auth.orgId) throw new UnauthorizedError('Organization context is required');
    return { userId: req.auth.userId, orgId: req.auth.orgId, role: req.auth.role };
  }

  private _auditContext(req: Request): { ipAddress?: string; userAgent?: string } {
    return {
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
    };
  }

  private async _registerKubernetes(
    organizationId: string,
    input: {
      namespaces?: KubernetesNamespace[];
      nodes?: KubernetesNode[];
      workloads?: KubernetesWorkload[];
      pods?: KubernetesPod[];
      services?: KubernetesServiceDto[];
    },
  ): Promise<void> {
    try {
      await resourceGraphService.registerKubernetesInventory(organizationId, input);
    } catch (error) {
      console.warn('Resource graph Kubernetes registration failed', {
        organizationId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export const kubernetesController = new KubernetesController();
