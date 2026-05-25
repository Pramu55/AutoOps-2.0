import { z } from 'zod';

export const ResourceProvider = {
  AUTOOPS: 'AUTOOPS',
  JENKINS: 'JENKINS',
  DOCKER: 'DOCKER',
  KUBERNETES: 'KUBERNETES',
  AWS: 'AWS',
  GITHUB_ACTIONS: 'GITHUB_ACTIONS',
} as const;
export type ResourceProvider = (typeof ResourceProvider)[keyof typeof ResourceProvider];

export const ResourceKind = {
  PROJECT: 'PROJECT',
  ENVIRONMENT: 'ENVIRONMENT',
  DEPLOYMENT: 'DEPLOYMENT',
  OPERATION: 'OPERATION',
  JENKINS_JOB: 'JENKINS_JOB',
  JENKINS_BUILD: 'JENKINS_BUILD',
  DOCKER_CONTAINER: 'DOCKER_CONTAINER',
  DOCKER_IMAGE: 'DOCKER_IMAGE',
  DOCKER_NETWORK: 'DOCKER_NETWORK',
  DOCKER_VOLUME: 'DOCKER_VOLUME',
  KUBERNETES_NAMESPACE: 'KUBERNETES_NAMESPACE',
  KUBERNETES_NODE: 'KUBERNETES_NODE',
  KUBERNETES_DEPLOYMENT: 'KUBERNETES_DEPLOYMENT',
  KUBERNETES_POD: 'KUBERNETES_POD',
  KUBERNETES_SERVICE: 'KUBERNETES_SERVICE',
  AWS_DEPLOYMENT_TARGET: 'AWS_DEPLOYMENT_TARGET',
  AWS_ECR_REPOSITORY: 'AWS_ECR_REPOSITORY',
  GITHUB_REPOSITORY: 'GITHUB_REPOSITORY',
  GITHUB_WORKFLOW: 'GITHUB_WORKFLOW',
} as const;
export type ResourceKind = (typeof ResourceKind)[keyof typeof ResourceKind];

export const ResourceEdgeType = {
  OWNS: 'OWNS',
  CONTAINS: 'CONTAINS',
  DEPLOYS_TO: 'DEPLOYS_TO',
  RUNS_ON: 'RUNS_ON',
  CREATED_BY: 'CREATED_BY',
  TRIGGERS: 'TRIGGERS',
  AFFECTS: 'AFFECTS',
  DEPENDS_ON: 'DEPENDS_ON',
  EXPOSES: 'EXPOSES',
  BUILDS: 'BUILDS',
  RELEASES: 'RELEASES',
} as const;
export type ResourceEdgeType = (typeof ResourceEdgeType)[keyof typeof ResourceEdgeType];

export const resourceProviderSchema = z.enum([
  'AUTOOPS',
  'JENKINS',
  'DOCKER',
  'KUBERNETES',
  'AWS',
  'GITHUB_ACTIONS',
]);

export const resourceKindSchema = z.enum([
  'PROJECT',
  'ENVIRONMENT',
  'DEPLOYMENT',
  'OPERATION',
  'JENKINS_JOB',
  'JENKINS_BUILD',
  'DOCKER_CONTAINER',
  'DOCKER_IMAGE',
  'DOCKER_NETWORK',
  'DOCKER_VOLUME',
  'KUBERNETES_NAMESPACE',
  'KUBERNETES_NODE',
  'KUBERNETES_DEPLOYMENT',
  'KUBERNETES_POD',
  'KUBERNETES_SERVICE',
  'AWS_DEPLOYMENT_TARGET',
  'AWS_ECR_REPOSITORY',
  'GITHUB_REPOSITORY',
  'GITHUB_WORKFLOW',
]);

export const resourceEdgeTypeSchema = z.enum([
  'OWNS',
  'CONTAINS',
  'DEPLOYS_TO',
  'RUNS_ON',
  'CREATED_BY',
  'TRIGGERS',
  'AFFECTS',
  'DEPENDS_ON',
  'EXPOSES',
  'BUILDS',
  'RELEASES',
]);

export const ResourceUrnSchema = z.string().min(1).max(512).regex(/^urn:autoops:/).brand<'ResourceUrn'>();
export type ResourceUrn = z.infer<typeof ResourceUrnSchema>;

export const ResourceNodeSummarySchema = z.object({
  id: z.string().min(1),
  urn: ResourceUrnSchema,
  provider: resourceProviderSchema,
  kind: resourceKindSchema,
  displayName: z.string().min(1).max(160),
  scopeLabel: z.string().max(120).optional(),
  tenantScoped: z.boolean().default(true),
  tags: z.record(z.string().max(80), z.string().max(160)).optional(),
  firstSeenAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
});
export type ResourceNodeSummary = z.infer<typeof ResourceNodeSummarySchema>;

export const ResourceEdgeSummarySchema = z.object({
  id: z.string().min(1),
  fromUrn: ResourceUrnSchema,
  toUrn: ResourceUrnSchema,
  type: resourceEdgeTypeSchema,
  displayName: z.string().max(160).optional(),
  discoveredAt: z.string().datetime().optional(),
});
export type ResourceEdgeSummary = z.infer<typeof ResourceEdgeSummarySchema>;

export const ResourceGraphReadinessResponseSchema = z.object({
  status: z.enum(['PLANNED', 'READY', 'DISABLED']),
  enabled: z.boolean(),
  nodePersistenceReady: z.boolean(),
  edgePersistenceReady: z.boolean(),
  signalIngestionReady: z.boolean(),
  message: z.string().max(500),
  nextSteps: z.array(z.string().max(240)),
});
export type ResourceGraphReadinessResponse = z.infer<typeof ResourceGraphReadinessResponseSchema>;
