import type { Request, Response } from 'express';
import type {
  AwsCloudWatchAlarm,
  AwsEc2Instance,
  AwsEcrRepository,
  AwsEcsCluster,
  AwsEcsService,
  AwsListResponse,
  AwsStatus,
  AwsSummary,
  AwsDeploymentTarget,
  AwsDeploymentPlanRequest,
} from '@autoops/types';
import { awsService } from './aws.service.js';

export class AwsController {
  status = async (_req: Request, res: Response<{ data: AwsStatus }>): Promise<void> => {
    res.json({ data: await awsService.getStatus() });
  };

  summary = async (_req: Request, res: Response<{ data: AwsSummary }>): Promise<void> => {
    res.json({ data: await awsService.getSummary() });
  };

  ec2Instances = async (_req: Request, res: Response<{ data: AwsListResponse<AwsEc2Instance> }>): Promise<void> => {
    res.json({ data: await awsService.listEc2Instances() });
  };

  ecsClusters = async (_req: Request, res: Response<{ data: AwsListResponse<AwsEcsCluster> }>): Promise<void> => {
    res.json({ data: await awsService.listEcsClusters() });
  };

  ecsServices = async (_req: Request, res: Response<{ data: AwsListResponse<AwsEcsService> }>): Promise<void> => {
    res.json({ data: await awsService.listEcsServices() });
  };

  ecrRepositories = async (_req: Request, res: Response<{ data: AwsListResponse<AwsEcrRepository> }>): Promise<void> => {
    res.json({ data: await awsService.listEcrRepositories() });
  };

  cloudWatchAlarms = async (_req: Request, res: Response<{ data: AwsListResponse<AwsCloudWatchAlarm> }>): Promise<void> => {
    res.json({ data: await awsService.listCloudWatchAlarms() });
  };

  identity = async (_req: Request, res: Response<{ data: AwsStatus }>): Promise<void> => {
    res.json({ data: await awsService.getStatus() });
  };

  deploymentTargets = async (_req: Request, res: Response<{ data: AwsListResponse<AwsDeploymentTarget> }>): Promise<void> => {
    res.json({ data: await awsService.listDeploymentTargets() });
  };

  deployments = async (req: Request, res: Response): Promise<void> => {
    const auth = req.auth as { orgId: string; userId: string; };
    res.json({ data: await awsService.listDeployments(auth.orgId) });
  };

  planDeployment = async (req: Request, res: Response): Promise<void> => {
    const { targetSlug } = req.params;
    const body = req.body as AwsDeploymentPlanRequest;
    if (body.confirmationToken !== 'PLAN') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Confirmation token "PLAN" is required.' } });
      return;
    }
    const auth = req.auth as { orgId: string; userId: string; };
    const result = await awsService.planDeployment(auth.orgId, auth.userId, targetSlug!);
    res.json({ data: result });
  };

  applyDeployment = async (req: Request, res: Response): Promise<void> => {
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
