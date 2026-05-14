import {
  ProviderCategory,
  ProviderConnectionStatus,
  ProviderKey,
  type IntegrationProvider,
} from '@autoops/types';
import { awsService } from '../aws/aws.service.js';
import { jenkinsService } from '../jenkins/jenkins.service.js';
import { kubernetesService } from '../kubernetes/kubernetes.service.js';

const now = () => new Date().toISOString();

export class ProviderRegistryService {
  async listProviders(): Promise<IntegrationProvider[]> {
    const [kubernetesStatus, awsStatus, jenkinsStatus] = await Promise.all([
      kubernetesService.getStatus(),
      awsService.getStatus(),
      jenkinsService.getStatus(),
    ]);

    return [
      {
        key: ProviderKey.KUBERNETES,
        displayName: 'Kubernetes',
        category: ProviderCategory.ORCHESTRATION,
        status: kubernetesStatus.status,
        configured: kubernetesStatus.status !== ProviderConnectionStatus.NOT_CONFIGURED,
        capabilities: [
          'kubernetes.read.cluster',
          'kubernetes.read.workloads',
          'kubernetes.restart.deployment',
          'kubernetes.apply.manifest.dry_run',
          'kubernetes.apply.manifest',
        ],
        readCapabilities: ['kubernetes.read.cluster', 'kubernetes.read.workloads'],
        writeCapabilities:
          kubernetesStatus.status === ProviderConnectionStatus.CONNECTED
            ? ['kubernetes.restart.deployment', 'kubernetes.apply.manifest.dry_run', 'kubernetes.apply.manifest']
            : [],
        dangerousCapabilities:
          kubernetesStatus.status === ProviderConnectionStatus.CONNECTED
            ? ['kubernetes.apply.manifest']
            : [],
        requiredEnvironment: [
          'KUBECONFIG',
          'KUBERNETES_API_SERVER_OVERRIDE',
          'KUBERNETES_TLS_SERVER_NAME_OVERRIDE',
        ],
        lastCheckedAt: kubernetesStatus.checkedAt,
        message: kubernetesStatus.message ?? 'Kubernetes provider checked.',
        source: 'runtime',
      },
      {
        key: ProviderKey.AWS,
        displayName: 'AWS',
        category: ProviderCategory.CLOUD,
        status: awsStatus.status,
        configured: awsStatus.configured,
        capabilities: [
          'aws.read.account',
          'aws.read.ec2',
          'aws.read.ecs',
          'aws.read.ecr',
          'aws.read.cloudwatch',
          'aws.read.lambda',
        ],
        readCapabilities: [
          'aws.read.account',
          'aws.read.ec2',
          'aws.read.ecs',
          'aws.read.ecr',
          'aws.read.cloudwatch',
          'aws.read.lambda',
        ],
        writeCapabilities: [],
        dangerousCapabilities: [],
        requiredEnvironment: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
        lastCheckedAt: awsStatus.checkedAt,
        message: awsStatus.message,
        source: 'environment',
      },
      {
        key: ProviderKey.JENKINS,
        displayName: 'Jenkins',
        category: ProviderCategory.CI_CD,
        status: jenkinsStatus.status,
        configured: jenkinsStatus.configured,
        capabilities: ['jenkins.read.status', 'jenkins.read.jobs', 'jenkins.read.builds', 'jenkins.trigger.build'],
        readCapabilities: ['jenkins.read.status', 'jenkins.read.jobs', 'jenkins.read.builds'],
        writeCapabilities:
          jenkinsStatus.status === ProviderConnectionStatus.CONNECTED && jenkinsStatus.triggerEnabled ? ['jenkins.trigger.build'] : [],
        dangerousCapabilities:
          jenkinsStatus.status === ProviderConnectionStatus.CONNECTED && jenkinsStatus.triggerEnabled ? ['jenkins.trigger.build'] : [],
        requiredEnvironment: ['JENKINS_URL', 'JENKINS_USERNAME', 'JENKINS_API_TOKEN', 'JENKINS_ALLOWED_JOBS'],
        lastCheckedAt: jenkinsStatus.checkedAt,
        message: jenkinsStatus.message,
        source: 'environment',
      },
      this._disconnected(ProviderKey.GITHUB, 'GitHub', ProviderCategory.CI_CD, ['GITHUB_TOKEN']),
      this._disconnected(ProviderKey.DOCKER, 'Docker/local', ProviderCategory.CONTAINER, []),
    ];
  }

  private _disconnected(
    key: ProviderKey,
    displayName: string,
    category: ProviderCategory,
    requiredEnvironment: string[],
  ): IntegrationProvider {
    return {
      key,
      displayName,
      category,
      status: ProviderConnectionStatus.NOT_CONFIGURED,
      configured: false,
      capabilities: [],
      readCapabilities: [],
      writeCapabilities: [],
      dangerousCapabilities: [],
      requiredEnvironment,
      lastCheckedAt: now(),
      message: `${displayName} connector is not implemented in this foundation milestone.`,
      source: 'environment',
    };
  }
}

export const providerRegistryService = new ProviderRegistryService();
