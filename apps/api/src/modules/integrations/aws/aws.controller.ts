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
}

export const awsController = new AwsController();
