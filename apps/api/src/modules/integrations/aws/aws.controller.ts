import type { Request, Response } from 'express';
import type {
  AwsCloudWatchAlarm,
  AwsEc2Instance,
  AwsEcrRepository,
  AwsEcsCluster,
  AwsEcsService,
  AwsListResponse,
  AwsStatusResponse,
  AwsSummary,
  AwsDeploymentTarget,
  AwsEcrReadinessResponse,
  AwsEcrImageBuildRequest,
  AwsEcrImagePushRequest,
  AwsEcrImageMetadata,
  AwsTerraformPlanReadinessResponse,
  AwsTerraformEcsPlanRequest,
  AwsTerraformApplyReadinessResponse,
  AwsTerraformEcsApplyRequest,
  AwsReleaseSummary,
  AwsReleaseHistoryResponse,
  AwsReleaseReadinessResponse,
  AwsReleasePromoteRequest,
  AwsReleasePromoteResponse,
  AwsReleaseRollbackRequest,
  AwsReleaseRollbackResponse,
} from '@autoops/types';
import {
  awsEcrImageBuildRequestSchema,
  awsEcrImagePushRequestSchema,
  awsTerraformEcsApplyRequestSchema,
  awsTerraformEcsPlanRequestSchema,
  awsReleasePromoteRequestSchema,
  awsReleaseRollbackRequestSchema,
} from '@autoops/types';
import { awsService } from './aws.service.js';
import { requireProviderInventoryAccess } from '../integration-access.service.js';

export class AwsController {
  status = async (_req: Request, res: Response<{ data: AwsStatusResponse }>): Promise<void> => {
    const raw = await awsService.getStatus();
    const safeStatus = {
      status: raw.status,
      configured: raw.configured,
      message: raw.message,
      checkedAt: raw.checkedAt,
    };
    res.json({ data: safeStatus as AwsStatusResponse });
  };

  identity = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getIdentity() });
  };

  readiness = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getReadiness() });
  };

  permissions = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getPermissions() });
  };

  remoteState = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getRemoteStateReadiness() });
  };

  workspaceReadiness = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const { targetSlug } = req.params;
    res.json({ data: await awsService.getWorkspaceReadiness(targetSlug!) });
  };

  terraformPlanReadiness = async (req: Request, res: Response<{ data: AwsTerraformPlanReadinessResponse }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const auth = req.auth as { orgId: string; userId: string };
    const targetSlug = typeof req.query.targetSlug === 'string' ? req.query.targetSlug : undefined;
    const environmentSlug = typeof req.query.environmentSlug === 'string' ? req.query.environmentSlug : undefined;
    res.json({ data: await awsService.getTerraformPlanReadiness(auth.orgId, targetSlug, environmentSlug) });
  };

  summary = async (req: Request, res: Response<{ data: AwsSummary }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getSummary() });
  };

  ec2Instances = async (req: Request, res: Response<{ data: AwsListResponse<AwsEc2Instance> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listEc2Instances() });
  };

  ecsClusters = async (req: Request, res: Response<{ data: AwsListResponse<AwsEcsCluster> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listEcsClusters() });
  };

  ecsServices = async (req: Request, res: Response<{ data: AwsListResponse<AwsEcsService> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listEcsServices() });
  };

  ecrRepositories = async (req: Request, res: Response<{ data: AwsListResponse<AwsEcrRepository> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listEcrRepositories() });
  };

  ecrReadiness = async (req: Request, res: Response<{ data: AwsEcrReadinessResponse }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.getEcrReadiness() });
  };

  ecrImages = async (req: Request, res: Response<{ data: AwsListResponse<AwsEcrImageMetadata> }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.listEcrImages(auth.orgId) });
  };

  buildEcrImage = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const body = awsEcrImageBuildRequestSchema.parse(req.body) as AwsEcrImageBuildRequest;
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.buildEcrImage(auth.orgId, auth.userId, body) });
  };

  pushEcrImage = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const body = awsEcrImagePushRequestSchema.parse(req.body) as AwsEcrImagePushRequest;
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.pushEcrImage(auth.orgId, auth.userId, body) });
  };

  cloudWatchAlarms = async (req: Request, res: Response<{ data: AwsListResponse<AwsCloudWatchAlarm> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listCloudWatchAlarms() });
  };

  deploymentTargets = async (req: Request, res: Response<{ data: AwsListResponse<AwsDeploymentTarget> }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    res.json({ data: await awsService.listDeploymentTargets() });
  };

  applyReadiness = async (req: Request, res: Response<{ data: AwsTerraformApplyReadinessResponse }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    const targetSlug = typeof req.query.targetSlug === 'string' ? req.query.targetSlug : undefined;
    const environmentSlug = typeof req.query.environmentSlug === 'string' ? req.query.environmentSlug : undefined;
    res.json({ data: await awsService.getTerraformApplyReadiness(auth.orgId, targetSlug, environmentSlug) });
  };

  deployments = async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string; };
    res.json({ data: await awsService.listDeployments(auth.orgId) });
  };

  planDeployment = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const { targetSlug } = req.params;
    const body = awsTerraformEcsPlanRequestSchema.parse({ ...req.body, targetSlug }) as AwsTerraformEcsPlanRequest;
    const auth = req.auth as { orgId: string; userId: string; };
    const result = await awsService.planDeployment(auth.orgId, auth.userId, targetSlug!, body);
    res.json({ data: result });
  };

  applyDeployment = async (req: Request, res: Response): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const { targetSlug } = req.params;
    const body = awsTerraformEcsApplyRequestSchema.parse(req.body) as AwsTerraformEcsApplyRequest;
    const auth = req.auth as { orgId: string; userId: string; };
    const result = await awsService.applyDeployment(auth.orgId, auth.userId, targetSlug!, body.environmentSlug);
    res.json({ data: result });
  };

  releases = async (req: Request, res: Response<{ data: AwsReleaseHistoryResponse }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    const targetSlug = typeof req.query.targetSlug === 'string' ? req.query.targetSlug : undefined;
    const environmentSlug = typeof req.query.environmentSlug === 'string' ? req.query.environmentSlug : undefined;
    res.json({ data: await awsService.listReleases(auth.orgId, targetSlug, environmentSlug) });
  };

  releaseHistory = async (req: Request, res: Response<{ data: AwsReleaseHistoryResponse }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.listReleaseHistory(auth.orgId) });
  };

  getRelease = async (req: Request, res: Response<{ data: AwsReleaseSummary }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    const { releaseId } = req.params;
    res.json({ data: await awsService.getRelease(auth.orgId, releaseId!) });
  };

  releaseReadiness = async (req: Request, res: Response<{ data: AwsReleaseReadinessResponse }>): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string };
    const targetSlug = typeof req.query.targetSlug === 'string' ? req.query.targetSlug : undefined;
    const environmentSlug = typeof req.query.environmentSlug === 'string' ? req.query.environmentSlug : undefined;
    res.json({ data: await awsService.getReleaseReadiness(auth.orgId, targetSlug, environmentSlug) });
  };

  promoteRelease = async (req: Request, res: Response<{ data: AwsReleasePromoteResponse }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const { releaseId } = req.params;
    const body = awsReleasePromoteRequestSchema.parse(req.body) as AwsReleasePromoteRequest;
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.promoteRelease(auth.orgId, auth.userId, releaseId!, body) });
  };

  rollbackRelease = async (req: Request, res: Response<{ data: AwsReleaseRollbackResponse }>): Promise<void> => {
    await requireProviderInventoryAccess(req.auth);
    const { releaseId } = req.params;
    const body = awsReleaseRollbackRequestSchema.parse(req.body) as AwsReleaseRollbackRequest;
    const auth = req.auth as { orgId: string; userId: string };
    res.json({ data: await awsService.rollbackRelease(auth.orgId, auth.userId, releaseId!, body) });
  };
}

export const awsController = new AwsController();
