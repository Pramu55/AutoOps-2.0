import { prisma } from '@autoops/database';
import {
  SignalSeverity,
  SignalSource,
  SignalStatus,
  SignalType,
  type SignalFilter,
  type SignalIngestInput,
  type SignalListResponse,
  type SignalReadinessResponse,
  type SignalSummary,
} from '@autoops/types';
import { NotFoundError } from '@autoops/utils';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { mapResourceSignalSummary, sanitizeSignalMetadata } from './signal.mapper.js';

export class SignalService {
  async ingestSignal(organizationId: string, input: SignalIngestInput): Promise<SignalSummary> {
    const now = new Date();
    const observedAt = input.observedAt || now;
    const dedupeMode = input.dedupeMode || 'DEDUPE';

    // Verify resourceNode ownership if provided
    if (input.resourceNodeId) {
      const node = await prisma.resourceNode.findFirst({
        where: { id: input.resourceNodeId, organizationId },
        select: { id: true },
      });
      if (!node) {
        // Safe skip link if not owned/found
        input.resourceNodeId = null;
      }
    }

    const fingerprint = this.buildSignalFingerprint(organizationId, input, dedupeMode);

    const signal = await prisma.resourceSignal.upsert({
      where: {
        organizationId_fingerprint: {
          organizationId,
          fingerprint,
        },
      },
      create: {
        organizationId,
        resourceNodeId: input.resourceNodeId ?? null,
        operationId: input.operationId ?? null,
        deploymentId: input.deploymentId ?? null,
        projectId: input.projectId ?? null,
        environmentId: input.environmentId ?? null,
        source: input.source,
        type: input.type,
        severity: input.severity,
        status: SignalStatus.ACTIVE,
        title: input.title,
        message: input.message,
        fingerprint,
        metadata: sanitizeSignalMetadata(input.metadata ?? {}),
        labels: input.labels ? sanitizeSignalMetadata(input.labels) : Prisma.JsonNull,
        observedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
      },
      update: {
        lastSeenAt: now,
        observedAt,
        count: dedupeMode === 'DEDUPE' ? { increment: 1 } : undefined,
        metadata: sanitizeSignalMetadata(input.metadata ?? {}),
        labels: input.labels ? sanitizeSignalMetadata(input.labels) : undefined,
        status: SignalStatus.ACTIVE, // Re-activate if it was resolved but same fingerprint seen again
        archivedAt: null,
      },
    });

    return mapResourceSignalSummary(signal);
  }

  async ingestSignals(organizationId: string, inputs: SignalIngestInput[]): Promise<SignalSummary[]> {
    const results: SignalSummary[] = [];
    for (const input of inputs) {
      try {
        results.push(await this.ingestSignal(organizationId, input));
      } catch (error) {
        console.error(`[SignalService] Failed to ingest signal for org ${organizationId}:`, error);
      }
    }
    return results;
  }

  async listSignals(organizationId: string, filters: SignalFilter): Promise<SignalListResponse> {
    const limit = filters.limit ?? 50;
    const where = this._filterWhere(organizationId, filters);

    const [items, total] = await Promise.all([
      prisma.resourceSignal.findMany({
        where,
        orderBy: [{ observedAt: 'desc' }, { id: 'asc' }],
        take: limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
      prisma.resourceSignal.count({ where }),
    ]);

    const page = items.slice(0, limit);
    return {
      items: page.map(mapResourceSignalSummary),
      nextCursor: items.length > limit ? items[limit]?.id ?? null : null,
      total,
    };
  }

  async getSignal(organizationId: string, signalId: string): Promise<SignalSummary> {
    const signal = await prisma.resourceSignal.findFirst({
      where: { id: signalId, organizationId },
    });
    if (!signal) throw new NotFoundError('Signal');
    return mapResourceSignalSummary(signal);
  }

  async getSignalReadiness(organizationId: string): Promise<SignalReadinessResponse> {
    const [totalSignals, activeSignals, latest, severityGrouped, sourceGrouped] = await Promise.all([
      prisma.resourceSignal.count({ where: { organizationId } }),
      prisma.resourceSignal.count({ where: { organizationId, status: SignalStatus.ACTIVE, archivedAt: null } }),
      prisma.resourceSignal.findFirst({ where: { organizationId }, orderBy: { observedAt: 'desc' } }),
      prisma.resourceSignal.groupBy({
        by: ['severity'],
        where: { organizationId, status: SignalStatus.ACTIVE, archivedAt: null },
        _count: { severity: true },
      }),
      prisma.resourceSignal.groupBy({
        by: ['source'],
        where: { organizationId, status: SignalStatus.ACTIVE, archivedAt: null },
        _count: { source: true },
      }),
    ]);

    const severityCounts = Object.fromEntries(
      Object.values(SignalSeverity).map((s) => [s, 0]),
    ) as SignalReadinessResponse['severityCounts'];
    for (const row of severityGrouped) {
      severityCounts[row.severity] = (row._count as any).severity ?? 0;
    }

    const sourceCounts = Object.fromEntries(
      Object.values(SignalSource).map((s) => [s, 0]),
    ) as SignalReadinessResponse['sourceCounts'];
    for (const row of sourceGrouped) {
      sourceCounts[row.source] = (row._count as any).source ?? 0;
    }

    return {
      status: totalSignals === 0 ? 'EMPTY' : 'READY',
      totalSignals,
      activeSignals,
      warningCount: severityCounts[SignalSeverity.WARNING] ?? 0,
      errorCount: severityCounts[SignalSeverity.ERROR] ?? 0,
      criticalCount: severityCounts[SignalSeverity.CRITICAL] ?? 0,
      sourceCounts,
      severityCounts,
      latestObservedAt: latest?.observedAt.toISOString() ?? null,
      checkedAt: new Date().toISOString(),
    };
  }

  async resolveSignal(organizationId: string, signalId: string): Promise<SignalSummary> {
    const signal = await prisma.resourceSignal.updateMany({
      where: { id: signalId, organizationId },
      data: { status: SignalStatus.RESOLVED },
    });
    if (signal.count === 0) throw new NotFoundError('Signal');
    return this.getSignal(organizationId, signalId);
  }

  async archiveSignal(organizationId: string, signalId: string): Promise<SignalSummary> {
    const signal = await prisma.resourceSignal.updateMany({
      where: { id: signalId, organizationId },
      data: { status: SignalStatus.ARCHIVED, archivedAt: new Date() },
    });
    if (signal.count === 0) throw new NotFoundError('Signal');
    return this.getSignal(organizationId, signalId);
  }

  async resolveSignalsByFingerprints(organizationId: string, fingerprints: string[]): Promise<number> {
    const uniqueFingerprints = [...new Set(fingerprints)].filter(Boolean);
    if (uniqueFingerprints.length === 0) return 0;

    const result = await prisma.resourceSignal.updateMany({
      where: {
        organizationId,
        fingerprint: { in: uniqueFingerprints },
        status: SignalStatus.ACTIVE,
        archivedAt: null,
      },
      data: {
        status: SignalStatus.RESOLVED,
        archivedAt: null,
      },
    });

    return result.count;
  }

  async resolveSignalsByTitles(
    organizationId: string,
    source: SignalSource,
    type: SignalType,
    titles: string[],
  ): Promise<number> {
    const uniqueTitles = [...new Set(titles)].filter(Boolean);
    if (uniqueTitles.length === 0) return 0;

    const result = await prisma.resourceSignal.updateMany({
      where: {
        organizationId,
        source,
        type,
        title: { in: uniqueTitles },
        status: SignalStatus.ACTIVE,
        archivedAt: null,
      },
      data: {
        status: SignalStatus.RESOLVED,
        archivedAt: null,
      },
    });

    return result.count;
  }

  buildSignalFingerprint(organizationId: string, input: SignalIngestInput, mode: 'DEDUPE' | 'EVENT'): string {
    const parts = [
      organizationId,
      input.source,
      input.type,
      input.resourceNodeId ?? 'none',
    ];

    if (mode === 'EVENT') {
      // For events, we want uniqueness per logical occurrence
      parts.push(input.operationId ?? 'no-op');
      parts.push(input.deploymentId ?? 'no-deploy');
      parts.push(input.metadata?.buildNumber ? String(input.metadata.buildNumber) : 'no-build');
      parts.push(input.metadata?.eventId ? String(input.metadata.eventId) : 'no-event');
      // If none of the above are present, we might want to include the timestamp bucket to prevent collision
      if (!input.operationId && !input.deploymentId && !input.metadata?.buildNumber && !input.metadata?.eventId) {
        const bucket = Math.floor((input.observedAt?.getTime() ?? Date.now()) / 1000); // 1-second bucket
        parts.push(String(bucket));
      }
    } else {
      // For dedupe, collapse one continuing condition for one stable monitored resource.
      parts.push(input.severity);
      parts.push(this._metadataString(input.metadata, 'resourceIdentity') ?? 'no-resource-identity');
      parts.push(this._metadataString(input.metadata, 'condition') ?? input.title.slice(0, 100));
    }

    return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  }

  private _metadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private _filterWhere(organizationId: string, filters: SignalFilter): Prisma.ResourceSignalWhereInput {
    const where: Prisma.ResourceSignalWhereInput = { organizationId };

    if (filters.source) where.source = filters.source;
    if (filters.type) where.type = filters.type;
    if (filters.severity) where.severity = filters.severity;
    if (filters.status) where.status = filters.status;
    if (filters.resourceNodeId) where.resourceNodeId = filters.resourceNodeId;
    if (filters.operationId) where.operationId = filters.operationId;
    if (filters.deploymentId) where.deploymentId = filters.deploymentId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.environmentId) where.environmentId = filters.environmentId;

    if (filters.archived === 'active') {
      where.archivedAt = null;
    } else if (filters.archived === 'archived') {
      where.archivedAt = { not: null };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.from || filters.to) {
      where.observedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    return where;
  }
}

export const signalService = new SignalService();
