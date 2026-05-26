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
  ORGANIZATION: 'ORGANIZATION',
  PROJECT: 'PROJECT',
  ENVIRONMENT: 'ENVIRONMENT',
  DEPLOYMENT: 'DEPLOYMENT',
  OPERATION: 'OPERATION',
  JENKINS_INSTANCE: 'JENKINS_INSTANCE',
  JENKINS_JOB: 'JENKINS_JOB',
  JENKINS_BUILD: 'JENKINS_BUILD',
  DOCKER_ENGINE: 'DOCKER_ENGINE',
  DOCKER_CONTAINER: 'DOCKER_CONTAINER',
  DOCKER_IMAGE: 'DOCKER_IMAGE',
  DOCKER_NETWORK: 'DOCKER_NETWORK',
  DOCKER_VOLUME: 'DOCKER_VOLUME',
  KUBERNETES_CLUSTER: 'KUBERNETES_CLUSTER',
  KUBERNETES_NAMESPACE: 'KUBERNETES_NAMESPACE',
  KUBERNETES_NODE: 'KUBERNETES_NODE',
  KUBERNETES_DEPLOYMENT: 'KUBERNETES_DEPLOYMENT',
  KUBERNETES_POD: 'KUBERNETES_POD',
  KUBERNETES_SERVICE: 'KUBERNETES_SERVICE',
  AWS_ACCOUNT: 'AWS_ACCOUNT',
  AWS_REGION: 'AWS_REGION',
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
  USES_IMAGE: 'USES_IMAGE',
  ATTACHED_TO: 'ATTACHED_TO',
  PART_OF: 'PART_OF',
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
  'ORGANIZATION',
  'PROJECT',
  'ENVIRONMENT',
  'DEPLOYMENT',
  'OPERATION',
  'JENKINS_INSTANCE',
  'JENKINS_JOB',
  'JENKINS_BUILD',
  'DOCKER_ENGINE',
  'DOCKER_CONTAINER',
  'DOCKER_IMAGE',
  'DOCKER_NETWORK',
  'DOCKER_VOLUME',
  'KUBERNETES_CLUSTER',
  'KUBERNETES_NAMESPACE',
  'KUBERNETES_NODE',
  'KUBERNETES_DEPLOYMENT',
  'KUBERNETES_POD',
  'KUBERNETES_SERVICE',
  'AWS_ACCOUNT',
  'AWS_REGION',
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
  'USES_IMAGE',
  'ATTACHED_TO',
  'PART_OF',
]);

export const ResourceUrnSchema = z.string().min(1).max(512).regex(/^urn:autoops:/).brand<'ResourceUrn'>();
export type ResourceUrn = z.infer<typeof ResourceUrnSchema>;

export const resourceGraphPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});
export type ResourceGraphPagination = z.infer<typeof resourceGraphPaginationSchema>;

export const resourceGraphFiltersSchema = z.object({
  provider: resourceProviderSchema.optional(),
  kind: resourceKindSchema.optional(),
  projectId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  deploymentId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  archived: z.enum(['active', 'archived', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});
export type ResourceGraphFilters = z.infer<typeof resourceGraphFiltersSchema>;

export const resourceMetadataSummarySchema = z.record(
  z.string().max(80),
  z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
);
export type ResourceMetadataSummary = z.infer<typeof resourceMetadataSummarySchema>;

export const ResourceNodeSummarySchema = z.object({
  id: z.string().uuid(),
  urn: ResourceUrnSchema,
  provider: resourceProviderSchema,
  kind: resourceKindSchema,
  name: z.string().min(1).max(160),
  displayName: z.string().min(1).max(160),
  externalId: z.string().max(160).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  environmentId: z.string().uuid().nullable().optional(),
  deploymentId: z.string().uuid().nullable().optional(),
  operationId: z.string().uuid().nullable().optional(),
  healthStatus: z.string().max(80).nullable().optional(),
  metadataSummary: resourceMetadataSummarySchema.default({}),
  labelsSummary: resourceMetadataSummarySchema.nullable().optional(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type ResourceNodeSummary = z.infer<typeof ResourceNodeSummarySchema>;

export const ResourceEdgeSummarySchema = z.object({
  id: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  type: resourceEdgeTypeSchema,
  metadataSummary: resourceMetadataSummarySchema.default({}),
  lastSeenAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  source: ResourceNodeSummarySchema.optional(),
  target: ResourceNodeSummarySchema.optional(),
});
export type ResourceEdgeSummary = z.infer<typeof ResourceEdgeSummarySchema>;

export const ResourceNodeDetailSchema = ResourceNodeSummarySchema.extend({
  incomingEdgeCount: z.number().int().min(0),
  outgoingEdgeCount: z.number().int().min(0),
});
export type ResourceNodeDetail = z.infer<typeof ResourceNodeDetailSchema>;

export const ResourceGraphListResponseSchema = z.object({
  items: z.array(ResourceNodeSummarySchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type ResourceGraphListResponse = z.infer<typeof ResourceGraphListResponseSchema>;

export const ResourceGraphNeighborResponseSchema = z.object({
  resource: ResourceNodeDetailSchema,
  incoming: z.array(ResourceEdgeSummarySchema),
  outgoing: z.array(ResourceEdgeSummarySchema),
});
export type ResourceGraphNeighborResponse = z.infer<typeof ResourceGraphNeighborResponseSchema>;

export const ResourceGraphProviderCountsSchema = z.record(resourceProviderSchema, z.number().int().min(0));
export type ResourceGraphProviderCounts = z.infer<typeof ResourceGraphProviderCountsSchema>;

export const ResourceGraphReadinessResponseSchema = z.object({
  status: z.enum(['READY', 'EMPTY', 'DEGRADED']),
  totalResources: z.number().int().min(0),
  totalEdges: z.number().int().min(0),
  providerCounts: ResourceGraphProviderCountsSchema,
  staleCount: z.number().int().min(0),
  archivedCount: z.number().int().min(0),
  lastSeenAt: z.string().datetime().nullable(),
  checkedAt: z.string().datetime(),
});
export type ResourceGraphReadinessResponse = z.infer<typeof ResourceGraphReadinessResponseSchema>;
