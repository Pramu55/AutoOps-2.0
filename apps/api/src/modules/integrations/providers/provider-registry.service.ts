import {
  ProviderCategory,
  ProviderConnectionStatus,
  ProviderKey,
  type IntegrationProvider,
} from '@autoops/types';
import { argocdService } from '../argocd/argocd.service.js';
import { awsService, mapAwsToProviderStatus } from '../aws/aws.service.js';
import { dockerService } from '../docker/docker.service.js';
import type { ProviderOrgPolicyBlockedStatus } from '../integration-access.service.js';
import { jenkinsService } from '../jenkins/jenkins.service.js';
import { kubernetesService } from '../kubernetes/kubernetes.service.js';
import { providerReadiness } from '../provider-readiness.js';

const now = () => new Date().toISOString();

function configuredFromKubernetesStatus(status: string): boolean {
  return ['CONNECTED', 'UNREACHABLE', 'AUTH_FAILED', 'FORBIDDEN'].includes(status);
}

export class ProviderRegistryService {
  listBlockedProviders(blocked: ProviderOrgPolicyBlockedStatus): IntegrationProvider[] {
    return [
      this._blocked(ProviderKey.KUBERNETES, 'Kubernetes', ProviderCategory.ORCHESTRATION, blocked),
      this._blocked(ProviderKey.AWS, 'AWS', ProviderCategory.CLOUD, blocked),
      this._blocked(ProviderKey.JENKINS, 'Jenkins', ProviderCategory.CI_CD, blocked),
      this._blocked(ProviderKey.GITHUB, 'GitHub', ProviderCategory.CI_CD, blocked),
      this._blocked(ProviderKey.ARGOCD, 'Argo CD', ProviderCategory.GITOPS, blocked),
      this._blocked(ProviderKey.DOCKER, 'Docker', ProviderCategory.CONTAINER, blocked),
    ];
  }

  async listProviders(): Promise<IntegrationProvider[]> {
    const [kubernetesStatus, awsStatus, jenkinsStatus, dockerStatus, argocdStatus] = await Promise.all([
      kubernetesService.getStatus(),
      awsService.getStatus(),
      jenkinsService.getStatus(),
      dockerService.getStatus(),
      argocdService.getStatus(),
    ]);

    const awsMappedStatus = mapAwsToProviderStatus(awsStatus.status);

    return [
      {
        key: ProviderKey.KUBERNETES,
        displayName: 'Kubernetes',
        category: ProviderCategory.ORCHESTRATION,
        status: kubernetesStatus.status,
        readiness: providerReadiness({
          status: kubernetesStatus.status,
          configured: kubernetesStatus.configured ?? configuredFromKubernetesStatus(kubernetesStatus.status),
          checkedAt: kubernetesStatus.checkedAt,
          message: kubernetesStatus.message,
        }),
        configured: kubernetesStatus.configured ?? configuredFromKubernetesStatus(kubernetesStatus.status),
        capabilities: [
          'kubernetes.read.cluster',
          'kubernetes.read.workloads',
          'kubernetes.scale.deployment',
          'kubernetes.rollout_restart.deployment',
        ],
        readCapabilities: ['kubernetes.read.cluster', 'kubernetes.read.workloads'],
        writeCapabilities:
          kubernetesStatus.status === ProviderConnectionStatus.CONNECTED
            ? ['kubernetes.scale.deployment', 'kubernetes.rollout_restart.deployment']
            : [],
        dangerousCapabilities: [],
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
        status: awsMappedStatus,
        readiness: providerReadiness({
          status: awsMappedStatus,
          configured: awsStatus.configured,
          checkedAt: awsStatus.checkedAt,
          message: awsStatus.message,
        }),
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
        readiness: providerReadiness({
          status: jenkinsStatus.status,
          configured: jenkinsStatus.configured,
          checkedAt: jenkinsStatus.checkedAt,
          message: jenkinsStatus.message,
        }),
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
      {
        key: ProviderKey.ARGOCD,
        displayName: 'Argo CD',
        category: ProviderCategory.GITOPS,
        status: argocdStatus.status,
        readiness: providerReadiness({
          status: argocdStatus.status,
          configured: argocdStatus.configured,
          checkedAt: argocdStatus.checkedAt,
          message: argocdStatus.message,
          remediation: argocdStatus.remediation,
        }),
        configured: argocdStatus.configured,
        capabilities: [
          'argocd.read.status',
          'argocd.read.applications',
          'argocd.read.summary',
        ],
        readCapabilities: [
          'argocd.read.status',
          'argocd.read.applications',
          'argocd.read.summary',
        ],
        writeCapabilities: [],
        dangerousCapabilities: [],
        requiredEnvironment: [
          'ARGOCD_URL',
          'ARGOCD_AUTH_TOKEN',
          'ARGOCD_USERNAME',
          'ARGOCD_PASSWORD',
        ],
        lastCheckedAt: argocdStatus.checkedAt,
        message: argocdStatus.message,
        source: 'environment',
      },
      {
        key: ProviderKey.DOCKER,
        displayName: 'Docker',
        category: ProviderCategory.CONTAINER,
        status: dockerStatus.status,
        readiness: providerReadiness({
          status: dockerStatus.status,
          configured: dockerStatus.configured,
          checkedAt: dockerStatus.checkedAt,
          message: dockerStatus.message,
        }),
        configured: dockerStatus.configured,
        capabilities: [
          'docker.read.status',
          'docker.read.containers',
          'docker.read.images',
          'docker.read.networks',
          'docker.read.volumes',
          'docker.read.logs',
          'docker.container.start',
          'docker.container.stop',
          'docker.container.restart',
        ],
        readCapabilities: [
          'docker.read.status',
          'docker.read.containers',
          'docker.read.images',
          'docker.read.networks',
          'docker.read.volumes',
          'docker.read.logs',
        ],
        writeCapabilities:
          dockerStatus.status === ProviderConnectionStatus.CONNECTED
            ? ['docker.container.start', 'docker.container.stop', 'docker.container.restart']
            : [],
        dangerousCapabilities:
          dockerStatus.status === ProviderConnectionStatus.CONNECTED ? ['docker.container.stop'] : [],
        requiredEnvironment: ['DOCKER_SOCKET_PATH', 'DOCKER_HOST'],
        lastCheckedAt: dockerStatus.checkedAt,
        message: dockerStatus.message,
        source: 'runtime',
      },
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
      readiness: providerReadiness({
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        checkedAt: null,
        message: `${displayName} connector is not implemented in this foundation milestone.`,
        reasonCode: 'CONNECTOR_NOT_IMPLEMENTED',
      }),
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

  private _blocked(
    key: ProviderKey,
    displayName: string,
    category: ProviderCategory,
    blocked: ProviderOrgPolicyBlockedStatus,
  ): IntegrationProvider {
    return {
      key,
      displayName,
      category,
      status: ProviderConnectionStatus.BLOCKED_BY_ORG_POLICY,
      readiness: providerReadiness({
        status: ProviderConnectionStatus.BLOCKED_BY_ORG_POLICY,
        configured: false,
        checkedAt: null,
        message: blocked.message,
        remediation: blocked.remediation,
        reasonCode: ProviderConnectionStatus.BLOCKED_BY_ORG_POLICY,
      }),
      configured: false,
      capabilities: [],
      readCapabilities: [],
      writeCapabilities: [],
      dangerousCapabilities: [],
      requiredEnvironment: [],
      lastCheckedAt: blocked.checkedAt,
      message: blocked.message,
      source: 'environment',
    };
  }
}

export const providerRegistryService = new ProviderRegistryService();
