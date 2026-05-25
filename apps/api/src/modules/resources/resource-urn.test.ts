import { describe, expect, it } from 'vitest';
import {
  buildAutoOpsDeploymentUrn,
  buildAutoOpsEnvironmentUrn,
  buildAutoOpsProjectUrn,
  buildDockerContainerUrn,
  buildDockerImageUrn,
  buildJenkinsBuildUrn,
  buildJenkinsJobUrn,
  buildKubernetesDeploymentUrn,
  buildKubernetesNamespaceUrn,
  buildKubernetesPodUrn,
  buildKubernetesServiceUrn,
  sanitizeUrnSegment,
} from '@autoops/utils';

describe('resource URN helpers', () => {
  it('builds stable Jenkins resource URNs', () => {
    expect(buildJenkinsJobUrn('Local', 'AutoOps Smoke Build')).toBe(
      'urn:autoops:jenkins:local:job/autoops-smoke-build',
    );
    expect(buildJenkinsBuildUrn('Local', 'AutoOps Smoke Build', 16)).toBe(
      'urn:autoops:jenkins:local:build/autoops-smoke-build/16',
    );
  });

  it('builds stable Docker resource URNs', () => {
    expect(buildDockerContainerUrn('Local', 'autoops-postgres')).toBe(
      'urn:autoops:docker:local:container/autoops-postgres',
    );
    expect(buildDockerImageUrn('Local', 'autoops/api:Latest')).toBe(
      'urn:autoops:docker:local:image/autoops/api-latest',
    );
  });

  it('builds stable Kubernetes resource URNs', () => {
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
  });

  it('builds AutoOps domain resource URNs without requiring organization IDs', () => {
    expect(buildAutoOpsProjectUrn('Project 123')).toBe('urn:autoops:autoops:project/project-123');
    expect(buildAutoOpsEnvironmentUrn('Environment 123')).toBe(
      'urn:autoops:autoops:environment/environment-123',
    );
    expect(buildAutoOpsDeploymentUrn('Deployment 123')).toBe(
      'urn:autoops:autoops:deployment/deployment-123',
    );
  });

  it('sanitizes spaces and unsafe separators deterministically', () => {
    expect(sanitizeUrnSegment('  Prod/API:Blue #1  ')).toBe('prod/api-blue-1');
  });

  it('rejects secret-like segments before creating URNs', () => {
    expect(() => sanitizeUrnSegment('aws-access-key-id')).toThrow(/secret-like/);
  });
});
