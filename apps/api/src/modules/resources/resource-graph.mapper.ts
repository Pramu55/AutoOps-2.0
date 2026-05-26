import type { Prisma, ResourceEdge, ResourceNode } from '@prisma/client';
import type {
  ResourceEdgeSummary,
  ResourceMetadataSummary,
  ResourceNodeDetail,
  ResourceNodeSummary,
} from '@autoops/types';

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_KEYS = 25;
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|credential|authorization|cookie|kubeconfig|accesskey|access_key|secretkey|secret_key|apitoken|api_token|privatekey|private_key|clientsecret|client_secret|session|bearer)/i;

export function sanitizeResourceMetadata(value: unknown): ResourceMetadataSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
  const summary: ResourceMetadataSummary = {};

  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().slice(0, 80);
    if (!key) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      summary[key] = REDACTED;
      continue;
    }

    if (rawValue === null || typeof rawValue === 'boolean' || typeof rawValue === 'number') {
      summary[key] = rawValue;
      continue;
    }

    if (typeof rawValue === 'string') {
      summary[key] = SENSITIVE_KEY_PATTERN.test(rawValue) ? REDACTED : rawValue.slice(0, MAX_STRING_LENGTH);
      continue;
    }

    if (Array.isArray(rawValue)) {
      summary[key] = `[${rawValue.length} items]`;
      continue;
    }

    if (typeof rawValue === 'object') {
      summary[key] = '[object]';
    }
  }

  return summary;
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
