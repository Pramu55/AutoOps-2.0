import { describe, expect, it } from 'vitest';
import {
  buildAutoOpsDeploymentUrn,
  buildAutoOpsEnvironmentUrn,
  buildAutoOpsOperationUrn,
  buildAutoOpsOrganizationUrn,
  buildAutoOpsProjectUrn,
  buildDockerContainerUrn,
  buildDockerEngineUrn,
  buildDockerImageUrn,
  buildDockerNetworkUrn,
  buildDockerVolumeUrn,
  buildJenkinsBuildUrn,
  buildJenkinsInstanceUrn,
  buildJenkinsJobUrn,
  buildKubernetesClusterUrn,
  buildKubernetesDeploymentUrn,
  buildKubernetesNamespaceUrn,
  buildKubernetesNodeUrn,
  buildKubernetesPodUrn,
  buildKubernetesServiceUrn,
  sanitizeUrnSegment,
} from '@autoops/utils';

describe('resource URN helpers', () => {
  it('builds stable Jenkins resource URNs', () => {
    expect(buildJenkinsInstanceUrn('Local')).toBe('urn:autoops:jenkins:local:instance/default');
    expect(buildJenkinsJobUrn('Local', 'AutoOps Smoke Build')).toBe(
      'urn:autoops:jenkins:local:job/autoops-smoke-build',
    );
    expect(buildJenkinsBuildUrn('Local', 'AutoOps Smoke Build', 16)).toBe(
      'urn:autoops:jenkins:local:build/autoops-smoke-build/16',
    );
  });

  it('builds stable Docker resource URNs', () => {
    expect(buildDockerEngineUrn('Local')).toBe('urn:autoops:docker:local:engine/default');
    expect(buildDockerContainerUrn('Local', 'autoops-postgres')).toBe(
      'urn:autoops:docker:local:container/autoops-postgres',
    );
    expect(buildDockerImageUrn('Local', 'autoops/api:Latest')).toBe(
      'urn:autoops:docker:local:image/autoops/api-latest',
    );
    expect(buildDockerNetworkUrn('Local', 'autoops_default')).toBe(
      'urn:autoops:docker:local:network/autoops_default',
    );
    expect(buildDockerVolumeUrn('Local', 'postgres-data')).toBe(
      'urn:autoops:docker:local:volume/postgres-data',
    );
  });

  it('builds stable Kubernetes resource URNs', () => {
    expect(buildKubernetesClusterUrn('Docker Desktop')).toBe(
      'urn:autoops:kubernetes:docker-desktop:cluster/default',
    );
    expect(buildKubernetesNamespaceUrn('Docker Desktop', 'default')).toBe(
      'urn:autoops:kubernetes:docker-desktop:namespace/default',
    );
    expect(buildKubernetesDeploymentUrn('Docker Desktop', 'default', 'autoops-api')).toBe(
      'urn:autoops:kubernetes:docker-desktop:namespace/default:deployment/autoops-api',
    );
    expect(buildKubernetesPodUrn('Docker Desktop', 'default', 'autoops-api-abc123')).toBe(
      'urn:autoops:kubernetes:docker-desktop:namespace/default:pod/autoops-api-abc123',
    );
    expect(buildKubernetesServiceUrn('Docker Desktop', 'default', 'autoops-api')).toBe(
      'urn:autoops:kubernetes:docker-desktop:namespace/default:service/autoops-api',
    );
    expect(buildKubernetesNodeUrn('Docker Desktop', 'docker-desktop')).toBe(
      'urn:autoops:kubernetes:docker-desktop:node/docker-desktop',
    );
  });

  it('builds AutoOps domain resource URNs without requiring organization IDs', () => {
    expect(buildAutoOpsOrganizationUrn()).toBe('urn:autoops:autoops:organization/current');
    expect(buildAutoOpsProjectUrn('Project 123')).toBe('urn:autoops:autoops:project/project-123');
    expect(buildAutoOpsEnvironmentUrn('Environment 123')).toBe(
      'urn:autoops:autoops:environment/environment-123',
    );
    expect(buildAutoOpsDeploymentUrn('Deployment 123')).toBe(
      'urn:autoops:autoops:deployment/deployment-123',
    );
    expect(buildAutoOpsOperationUrn('Operation 123')).toBe(
      'urn:autoops:autoops:operation/operation-123',
    );
  });

  it('sanitizes spaces and unsafe separators deterministically', () => {
    expect(sanitizeUrnSegment('  Prod/API:Blue #1  ')).toBe('prod/api-blue-1');
  });

  it('rejects secret-like segments before creating URNs', () => {
    expect(() => sanitizeUrnSegment('aws-access-key-id')).toThrow(/secret-like/);
  });
});
