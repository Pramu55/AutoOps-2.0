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

type WorkloadParams = {
  namespace: string;
  name: string;
};

export class KubernetesController {
  status = async (_req: Request, res: Response<{ data: KubernetesStatus }>): Promise<void> => {
    res.json({ data: await kubernetesService.getStatus() });
  };

  summary = async (_req: Request, res: Response<{ data: KubernetesSummary }>): Promise<void> => {
    res.json({ data: await kubernetesService.getSummary() });
  };

  namespaces = async (
    _req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesNamespace> }>,
  ): Promise<void> => {
    res.json({ data: await kubernetesService.listNamespaces() });
  };

  workloads = async (
    _req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesWorkload> }>,
  ): Promise<void> => {
    res.json({ data: await kubernetesService.listWorkloads() });
  };

  pods = async (
    _req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesPod> }>,
  ): Promise<void> => {
    res.json({ data: await kubernetesService.listPods() });
  };

  services = async (
    _req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesServiceDto> }>,
  ): Promise<void> => {
    res.json({ data: await kubernetesService.listServices() });
  };

  nodes = async (
    _req: Request,
    res: Response<{ data: KubernetesListResponse<KubernetesNode> }>,
  ): Promise<void> => {
    res.json({ data: await kubernetesService.listNodes() });
  };

  rolloutStatus = async (
    req: Request<WorkloadParams>,
    res: Response<{ data: KubernetesRolloutStatus }>,
  ): Promise<void> => {
    res.json({
      data: await kubernetesService.getRolloutStatus(req.params.namespace, req.params.name),
    });
  };

  restartDeployment = async (
    req: Request<WorkloadParams, unknown, KubernetesRestartDeploymentInput>,
    res: Response<{ data: Operation }>,
  ): Promise<void> => {
    const auth = this._requireAuth(req);
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
}

export const kubernetesController = new KubernetesController();
