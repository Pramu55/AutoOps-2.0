import {
  CloudWatchClient,
  DescribeAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import {
  ECRClient,
  DescribeRepositoriesCommand,
} from '@aws-sdk/client-ecr';
import {
  ECSClient,
  DescribeClustersCommand,
  DescribeServicesCommand,
  ListClustersCommand,
  ListServicesCommand,
} from '@aws-sdk/client-ecs';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { ProviderConnectionStatus } from '@autoops/types';

export {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DescribeClustersCommand,
  DescribeInstancesCommand,
  DescribeRepositoriesCommand,
  DescribeServicesCommand,
  EC2Client,
  ECRClient,
  ECSClient,
  GetCallerIdentityCommand,
  LambdaClient,
  ListClustersCommand,
  ListFunctionsCommand,
  ListServicesCommand,
  STSClient,
};

export interface AwsClientBundle {
  region: string;
  sts: STSClient;
  ec2: EC2Client;
  ecs: ECSClient;
  ecr: ECRClient;
  cloudWatch: CloudWatchClient;
  lambda: LambdaClient;
}

export function getAwsConfiguration(): { configured: boolean; region?: string; message: string } {
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (!region) {
    return {
      configured: false,
      message: 'AWS_REGION is required for AWS discovery.',
    };
  }

  if (!accessKeyId || !secretAccessKey) {
    return {
      configured: false,
      region,
      message: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for AWS discovery.',
    };
  }

  return {
    configured: true,
    region,
    message: 'AWS environment credentials are configured.',
  };
}

export function createAwsClients(): AwsClientBundle | null {
  const config = getAwsConfiguration();
  if (!config.configured || !config.region) return null;

  return {
    region: config.region,
    sts: new STSClient({ region: config.region }),
    ec2: new EC2Client({ region: config.region }),
    ecs: new ECSClient({ region: config.region }),
    ecr: new ECRClient({ region: config.region }),
    cloudWatch: new CloudWatchClient({ region: config.region }),
    lambda: new LambdaClient({ region: config.region }),
  };
}

export function classifyAwsError(error: unknown): ProviderConnectionStatus {
  const candidate = error as { name?: string; message?: string; '$metadata'?: { httpStatusCode?: number } };
  const name = candidate?.name ?? '';
  const message = candidate?.message?.toLowerCase() ?? '';
  const statusCode = candidate?.$metadata?.httpStatusCode;

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    name.includes('InvalidClientToken') ||
    name.includes('UnrecognizedClient') ||
    name.includes('Signature') ||
    message.includes('security token') ||
    message.includes('credential')
  ) {
    return ProviderConnectionStatus.AUTH_FAILED;
  }

  return ProviderConnectionStatus.UNREACHABLE;
}

export function safeAwsMessage(error: unknown): string {
  const candidate = error as { name?: string; message?: string };
  if (candidate?.name) return candidate.name;
  if (candidate?.message) return candidate.message;
  return 'AWS provider request failed.';
}
