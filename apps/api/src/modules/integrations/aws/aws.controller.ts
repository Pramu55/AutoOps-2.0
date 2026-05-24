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
  AwsDeploymentPlanRequest,
  AwsEcrReadinessResponse,
  AwsEcrImageBuildRequest,
  AwsEcrImagePushRequest,
  AwsEcrImageMetadata,
  AwsTerraformPlanReadinessResponse,
  AwsTerraformEcsPlanRequest,
} from '@autoops/types';
import { awsEcrImageBuildRequestSchema, awsEcrImagePushRequestSchema, awsTerraformEcsPlanRequestSchema } from '@autoops/types';
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
    const body = req.body as AwsDeploymentPlanRequest;
    if (body.confirmationToken !== 'APPLY') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Confirmation token "APPLY" is required.' } });
      return;
    }
    const auth = req.auth as { orgId: string; userId: string; };
    const result = await awsService.applyDeployment(auth.orgId, auth.userId, targetSlug!);
    res.json({ data: result });
  };
}

export const awsController = new AwsController();
