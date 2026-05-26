const SECRET_LIKE_PATTERN =
  /(authorization|bearer|password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token)/i;

export function sanitizeUrnSegment(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Resource URN segment cannot be empty.');
  }
  if (SECRET_LIKE_PATTERN.test(trimmed)) {
    throw new Error('Resource URN segment looks secret-like and cannot be used.');
  }
  const sanitized = trimmed
    .toLowerCase()
    .replace(/\\/g, '-')
    .replace(/[:?#\[\]@!$&'()*+,;=]+/g, '-')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[./-]+|[./-]+$/g, '');

  if (!sanitized) {
    throw new Error('Resource URN segment cannot be sanitized to an empty value.');
  }
  return sanitized;
}

export function buildJenkinsJobUrn(instanceSlug: string, jobName: string): string {
  return `urn:autoops:jenkins:${sanitizeUrnSegment(instanceSlug)}:job/${sanitizeUrnSegment(jobName)}`;
}

export function buildJenkinsInstanceUrn(instanceSlug: string): string {
  return `urn:autoops:jenkins:${sanitizeUrnSegment(instanceSlug)}:instance/default`;
}

export function buildJenkinsBuildUrn(
  instanceSlug: string,
  jobName: string,
  buildNumber: number | string,
): string {
  return `${buildJenkinsJobUrn(instanceSlug, jobName).replace(':job/', ':build/')}/${sanitizeUrnSegment(String(buildNumber))}`;
}

export function buildDockerContainerUrn(engineSlug: string, containerNameOrId: string): string {
  return `urn:autoops:docker:${sanitizeUrnSegment(engineSlug)}:container/${sanitizeUrnSegment(containerNameOrId)}`;
}

export function buildDockerEngineUrn(engineSlug: string): string {
  return `urn:autoops:docker:${sanitizeUrnSegment(engineSlug)}:engine/default`;
}

export function buildDockerImageUrn(engineSlug: string, imageIdOrRepoTag: string): string {
  return `urn:autoops:docker:${sanitizeUrnSegment(engineSlug)}:image/${sanitizeUrnSegment(imageIdOrRepoTag)}`;
}

export function buildDockerNetworkUrn(engineSlug: string, networkNameOrId: string): string {
  return `urn:autoops:docker:${sanitizeUrnSegment(engineSlug)}:network/${sanitizeUrnSegment(networkNameOrId)}`;
}

export function buildDockerVolumeUrn(engineSlug: string, volumeName: string): string {
  return `urn:autoops:docker:${sanitizeUrnSegment(engineSlug)}:volume/${sanitizeUrnSegment(volumeName)}`;
}

export function buildKubernetesClusterUrn(clusterSlug: string): string {
  return `urn:autoops:kubernetes:${sanitizeUrnSegment(clusterSlug)}:cluster/default`;
}

export function buildKubernetesNamespaceUrn(clusterSlug: string, namespace: string): string {
  return `urn:autoops:kubernetes:${sanitizeUrnSegment(clusterSlug)}:namespace/${sanitizeUrnSegment(namespace)}`;
}

export function buildKubernetesNodeUrn(clusterSlug: string, nodeName: string): string {
  return `urn:autoops:kubernetes:${sanitizeUrnSegment(clusterSlug)}:node/${sanitizeUrnSegment(nodeName)}`;
}

export function buildKubernetesDeploymentUrn(
  clusterSlug: string,
  namespace: string,
  deploymentName: string,
): string {
  return `${buildKubernetesNamespaceUrn(clusterSlug, namespace)}:deployment/${sanitizeUrnSegment(deploymentName)}`;
}

export function buildKubernetesPodUrn(clusterSlug: string, namespace: string, podName: string): string {
  return `${buildKubernetesNamespaceUrn(clusterSlug, namespace)}:pod/${sanitizeUrnSegment(podName)}`;
}

export function buildKubernetesServiceUrn(
  clusterSlug: string,
  namespace: string,
  serviceName: string,
): string {
  return `${buildKubernetesNamespaceUrn(clusterSlug, namespace)}:service/${sanitizeUrnSegment(serviceName)}`;
}

export function buildAutoOpsProjectUrn(projectId: string): string {
  return `urn:autoops:autoops:project/${sanitizeUrnSegment(projectId)}`;
}

export function buildAutoOpsOrganizationUrn(): string {
  return 'urn:autoops:autoops:organization/current';
}

export function buildAutoOpsEnvironmentUrn(environmentId: string): string {
  return `urn:autoops:autoops:environment/${sanitizeUrnSegment(environmentId)}`;
}

export function buildAutoOpsDeploymentUrn(deploymentId: string): string {
  return `urn:autoops:autoops:deployment/${sanitizeUrnSegment(deploymentId)}`;
}

export function buildAutoOpsOperationUrn(operationId: string): string {
  return `urn:autoops:autoops:operation/${sanitizeUrnSegment(operationId)}`;
}
