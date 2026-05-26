import type { Prisma, ResourceEdge, ResourceNode } from '@prisma/client';
import { sanitizeMetadata } from '@autoops/utils';
import type {
  ResourceEdgeSummary,
  ResourceMetadataSummary,
  ResourceNodeDetail,
  ResourceNodeSummary,
} from '@autoops/types';

export function sanitizeResourceMetadata(value: unknown): ResourceMetadataSummary {
  return sanitizeMetadata(value) as ResourceMetadataSummary;
}

function jsonToSummary(value: Prisma.JsonValue | null): ResourceMetadataSummary {
  return sanitizeResourceMetadata(value);
}


export function mapResourceNodeSummary(node: ResourceNode): ResourceNodeSummary {
  return {
    id: node.id,
    urn: node.urn as ResourceNodeSummary['urn'],
    provider: node.provider,
    kind: node.kind,
    name: node.name,
    displayName: node.displayName,
    externalId: node.externalId,
    projectId: node.projectId,
    environmentId: node.environmentId,
    deploymentId: node.deploymentId,
    operationId: node.operationId,
    healthStatus: node.healthStatus,
    metadataSummary: jsonToSummary(node.metadata),
    labelsSummary: node.labels ? jsonToSummary(node.labels) : null,
    firstSeenAt: node.firstSeenAt.toISOString(),
    lastSeenAt: node.lastSeenAt.toISOString(),
    archivedAt: node.archivedAt?.toISOString() ?? null,
  };
}

export function mapResourceNodeDetail(
  node: ResourceNode,
  counts: { incomingEdgeCount: number; outgoingEdgeCount: number },
): ResourceNodeDetail {
  return {
    ...mapResourceNodeSummary(node),
    incomingEdgeCount: counts.incomingEdgeCount,
    outgoingEdgeCount: counts.outgoingEdgeCount,
  };
}

type EdgeWithNodes = ResourceEdge & {
  sourceNode?: ResourceNode;
  targetNode?: ResourceNode;
};

export function mapResourceEdgeSummary(edge: EdgeWithNodes): ResourceEdgeSummary {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    type: edge.type,
    metadataSummary: jsonToSummary(edge.metadata),
    lastSeenAt: edge.lastSeenAt.toISOString(),
    archivedAt: edge.archivedAt?.toISOString() ?? null,
    source: edge.sourceNode ? mapResourceNodeSummary(edge.sourceNode) : undefined,
    target: edge.targetNode ? mapResourceNodeSummary(edge.targetNode) : undefined,
  };
}
