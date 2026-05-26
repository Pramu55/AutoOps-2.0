import { prisma } from '@autoops/database';
import {
  JenkinsBuild,
  JenkinsJob,
  JenkinsListResponse,
  JenkinsOperation,
  JenkinsOperationListResponse,
  JenkinsOperationsQuery,
  JenkinsStatusResponse,
  JenkinsSummaryResponse,
  JenkinsTriggerBuildInput,
  JenkinsTriggerBuildResponse,
  OperationProvider,
  OperationType,
  ProviderConnectionStatus,
  SignalSeverity,
  SignalSource,
  SignalType,
  type SignalIngestInput,
} from '@autoops/types';
import { BadRequestError } from '@autoops/utils';
import { operationService } from '../../operations/operation.service.js';
import { signalService } from '../../signals/signal.service.js';
import {
  JenkinsClient,
  classifyJenkinsError,
  getJenkinsConfiguration,
  safeJenkinsMessage,
} from './jenkins.client.js';

type AuditContext = { ipAddress?: string; userAgent?: string };

type JenkinsRoot = {
  mode?: string;
  nodeDescription?: string;
  nodeName?: string;
  numExecutors?: number;
  useCrumbs?: boolean;
  jobs?: JenkinsApiJob[];
  views?: unknown[];
  overallLoad?: { busyExecutors?: number; totalExecutors?: number };
  queue?: { items?: unknown[] };
};

type JenkinsApiBuild = {
  number?: number;
  url?: string;
  result?: string | null;
  building?: boolean;
  timestamp?: number;
  duration?: number;
  estimatedDuration?: number;
  displayName?: string;
  fullDisplayName?: string;
};

type JenkinsApiJob = {
  name?: string;
  fullName?: string;
  url?: string;
  color?: string;
  buildable?: boolean;
  disabled?: boolean;
  inQueue?: boolean;
  lastBuild?: JenkinsApiBuild | null;
  lastSuccessfulBuild?: JenkinsApiBuild | null;
  lastFailedBuild?: JenkinsApiBuild | null;
  builds?: JenkinsApiBuild[];
  healthReport?: Array<Record<string, unknown>>;
};

type JenkinsOperationRecord = {
  id: string;
  operationType: OperationType;
  status: JenkinsOperation['status'];
  input: unknown;
  result: unknown;
  error: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export class JenkinsService {
  async getStatus(organizationId?: string): Promise<JenkinsStatusResponse> {
    const checkedAt = new Date().toISOString();
    const config = getJenkinsConfiguration();
    if (!config.configured) {
      return {
        status: ProviderConnectionStatus.NOT_CONFIGURED,
        configured: false,
        baseUrl: config.baseUrl,
        username: config.username,
        allowedJobs: config.allowedJobs,
        triggerEnabled: false,
        message: config.message,
        checkedAt,
      };
    }

    try {
      const client = new JenkinsClient(config);
      const response = await client.getJson<JenkinsRoot>(
        '/api/json?tree=mode,nodeDescription,nodeName,numExecutors,useCrumbs,jobs[name]',
      );

      if (organizationId) {
        void signalService.ingestSignal(organizationId, {
          source: SignalSource.JENKINS,
          type: SignalType.PROVIDER_CONNECTED,
          severity: SignalSeverity.INFO,
          title: 'Jenkins Provider Connected',
          message: 'Successfully connected to Jenkins API.',
          metadata: { baseUrl: config.baseUrl },
          dedupeMode: 'DEDUPE',
        });
      }

      return {
        status: ProviderConnectionStatus.CONNECTED,
        configured: true,
        baseUrl: config.baseUrl,
        username: config.username,
        allowedJobs: config.allowedJobs,
        triggerEnabled: config.allowedJobs.length > 0,
        version: response.headers.get('x-jenkins') ?? undefined,
        mode: response.data.mode,
        nodeDescription: response.data.nodeDescription,
        nodeName: response.data.nodeName,
        numExecutors: response.data.numExecutors,
        useCrumbs: response.data.useCrumbs,
        message: 'Connected to Jenkins.',
        checkedAt,
      };
    } catch (error) {
      const failureStatus = classifyJenkinsError(error);
      if (organizationId) {
        void signalService.ingestSignal(organizationId, {
          source: SignalSource.JENKINS,
          type: failureStatus === ProviderConnectionStatus.AUTH_FAILED
            ? SignalType.PROVIDER_AUTH_FAILED
            : SignalType.PROVIDER_UNREACHABLE,
          severity: SignalSeverity.ERROR,
          title: `Jenkins Provider ${failureStatus}`,
          message: safeJenkinsMessage(error),
          metadata: { status: failureStatus, error: error instanceof Error ? error.message : String(error) },
          dedupeMode: 'DEDUPE',
        });
      }
      return {
        status: failureStatus,
        configured: true,
        baseUrl: config.baseUrl,
        username: config.username,
        allowedJobs: config.allowedJobs,
        triggerEnabled: false,
        message: safeJenkinsMessage(error),
        checkedAt,
      };
    }
  }

  async getSummary(organizationId?: string): Promise<JenkinsSummaryResponse> {
    const checkedAt = new Date().toISOString();
    const status = await this.getStatus(organizationId);
    if (status.status !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: status.status,
        configured: status.configured,
        allowedJobs: status.allowedJobs ?? [],
        triggerEnabled: false,
        jobCount: 0,
        buildableJobCount: 0,
        disabledJobCount: 0,
        queueCount: 0,
        viewCount: 0,
        recentBuilds: [],
        checkedAt,
        partialFailures: [],
      };
    }

    const client = new JenkinsClient();
    const partialFailures: Array<{ scope: string; message: string }> = [];
    try {
      const root = await client.getJson<JenkinsRoot>(
        '/api/json?tree=jobs[name,fullName,url,color,buildable,disabled,inQueue,lastBuild[number,url,result,building,timestamp,duration,estimatedDuration,displayName,fullDisplayName]],views[name],queue[items[id]],overallLoad[busyExecutors,totalExecutors]',
      );
      const jobs = (root.data.jobs ?? []).map((job) => this._toJob(job));
      const recentBuilds = jobs.flatMap((job) => [job.lastBuild].filter(Boolean) as JenkinsBuild[]);

      if (organizationId && recentBuilds.length > 0) {
        void this._ingestBuildSignals(organizationId, recentBuilds);
      }

      return {
        status: ProviderConnectionStatus.CONNECTED,
        configured: true,
        allowedJobs: status.allowedJobs ?? [],
        triggerEnabled: (status.allowedJobs ?? []).length > 0,
        jobCount: jobs.length,
        buildableJobCount: jobs.filter((job) => job.buildable === true && job.disabled !== true).length,
        disabledJobCount: jobs.filter((job) => job.disabled === true).length,
        queueCount: root.data.queue?.items?.length ?? 0,
        viewCount: root.data.views?.length ?? 0,
        busyExecutors: root.data.overallLoad?.busyExecutors,
        totalExecutors: root.data.overallLoad?.totalExecutors,
        recentBuilds: recentBuilds.slice(0, 20),
        checkedAt,
        partialFailures,
      };
    } catch (error) {
      partialFailures.push({ scope: 'summary', message: safeJenkinsMessage(error) });
      return {
        status: classifyJenkinsError(error),
        configured: true,
        allowedJobs: status.allowedJobs ?? [],
        triggerEnabled: false,
        jobCount: 0,
        buildableJobCount: 0,
        disabledJobCount: 0,
        queueCount: 0,
        viewCount: 0,
        recentBuilds: [],
        checkedAt,
        partialFailures,
      };
    }
  }

  async listJobs(): Promise<JenkinsListResponse<JenkinsJob>> {
    return this._listResponse(async (client) => {
      const response = await client.getJson<JenkinsRoot>(
        '/api/json?tree=jobs[name,fullName,url,color,buildable,disabled,inQueue,lastBuild[number,url,result,building,timestamp,duration,estimatedDuration,displayName,fullDisplayName],lastSuccessfulBuild[number,url,result,building,timestamp,duration,estimatedDuration,displayName,fullDisplayName],lastFailedBuild[number,url,result,building,timestamp,duration,estimatedDuration,displayName,fullDisplayName],healthReport[score,description]]',
      );
      return (response.data.jobs ?? []).map((job) => this._toJob(job));
    });
  }

  async listBuilds(organizationId?: string): Promise<JenkinsListResponse<JenkinsBuild>> {
    return this._listResponse(async (client) => {
      const response = await client.getJson<JenkinsRoot>(
        '/api/json?tree=jobs[name,fullName,builds[number,url,result,building,timestamp,duration,estimatedDuration,displayName,fullDisplayName]]',
      );
      const builds = (response.data.jobs ?? [])
        .flatMap((job) =>
          (job.builds ?? []).map((build) => this._toBuild(job.fullName ?? job.name ?? 'unknown', build)),
        )
        .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
        .slice(0, 100);

      if (organizationId && builds.length > 0) {
        void this._ingestBuildSignals(organizationId, builds);
      }

      return builds;
    });
  }

  async listOperations(
    organizationId: string,
    query: JenkinsOperationsQuery,
  ): Promise<JenkinsOperationListResponse> {
    const operations = await prisma.operation.findMany({
      where: {
        organizationId,
        provider: OperationProvider.JENKINS,
        operationType: OperationType.JENKINS_BUILD_TRIGGER,
        status: query.status,
        ...(query.jobName
          ? {
              input: {
                path: ['jobName'],
                equals: query.jobName,
              },
            }
          : {}),
      },
      select: {
        id: true,
        operationType: true,
        status: true,
        input: true,
        result: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return {
      items: operations.map((operation) => this._toJenkinsOperation(operation)),
    };
  }

  async triggerBuild(
    jobName: string,
    organizationId: string,
    userId: string,
    role: string | undefined,
    input: JenkinsTriggerBuildInput,
    auditContext: AuditContext,
  ): Promise<JenkinsTriggerBuildResponse> {
    if (!jobName.trim()) throw new BadRequestError('Jenkins job name is required');
    if (input.confirmationToken !== 'BUILD') throw new BadRequestError('confirmationToken must be BUILD');
    const status = await this.getStatus();
    if (status.status !== ProviderConnectionStatus.CONNECTED) {
      throw new BadRequestError(status.message || 'Jenkins must be connected before triggering builds');
    }
    if (!status.allowedJobs?.length) {
      throw new BadRequestError('Jenkins build triggering is disabled because JENKINS_ALLOWED_JOBS is empty');
    }
    if (!status.allowedJobs?.includes(jobName)) {
      throw new BadRequestError('Jenkins job is not allowlisted for AutoOps triggering');
    }

    const operation = await operationService.createQueuedOperation(
      {
        organizationId,
        userId,
        role,
        provider: OperationProvider.JENKINS,
        operationType: OperationType.JENKINS_BUILD_TRIGGER,
        input: { jobName, ...input },
        projectId: input.projectId,
        environmentId: input.environmentId,
        confirmationToken: input.confirmationToken,
      },
      auditContext,
    );

    const policy = this._policyFromOperation(this._toRecord(operation.input));

    return {
      operationId: operation.id,
      status: operation.status,
      approvalRequired: operation.status === 'PENDING_APPROVAL',
      approvalReason: policy.approvalReason,
      riskLevel: policy.riskLevel,
      policyName: policy.policyName,
      message: `Jenkins build trigger ${operation.status.toLowerCase()}.`,
    };
  }

  private async _listResponse<T>(
    loader: (client: JenkinsClient) => Promise<T[]>,
  ): Promise<JenkinsListResponse<T>> {
    const status = await this.getStatus();
    if (status.status !== ProviderConnectionStatus.CONNECTED) {
      return {
        status: status.status,
        configured: status.configured,
        checkedAt: status.checkedAt,
        message: status.message,
        items: [],
      };
    }

    try {
      return {
        status: status.status,
        configured: status.configured,
        checkedAt: new Date().toISOString(),
        message: status.message,
        items: await loader(new JenkinsClient()),
      };
    } catch (error) {
      return {
        status: classifyJenkinsError(error),
        configured: true,
        checkedAt: new Date().toISOString(),
        message: safeJenkinsMessage(error),
        items: [],
      };
    }
  }

  private _toJob(job: JenkinsApiJob): JenkinsJob {
    return {
      name: job.name ?? 'unknown',
      fullName: job.fullName,
      url: job.url ?? '',
      color: job.color ?? null,
      status: this._jobStatus(job),
      buildable: job.buildable,
      disabled: job.disabled,
      inQueue: job.inQueue,
      lastBuild: job.lastBuild ? this._toBuild(job.fullName ?? job.name ?? 'unknown', job.lastBuild) : null,
      lastSuccessfulBuild: job.lastSuccessfulBuild
        ? this._toBuild(job.fullName ?? job.name ?? 'unknown', job.lastSuccessfulBuild)
        : null,
      lastFailedBuild: job.lastFailedBuild
        ? this._toBuild(job.fullName ?? job.name ?? 'unknown', job.lastFailedBuild)
        : null,
      healthReport: job.healthReport,
    };
  }

  private _toBuild(jobName: string, build: JenkinsApiBuild): JenkinsBuild {
    return {
      jobName,
      buildNumber: build.number ?? 0,
      url: build.url ?? '',
      result: build.result ?? null,
      building: build.building ?? false,
      timestamp: build.timestamp ? new Date(build.timestamp).toISOString() : null,
      duration: build.duration ?? null,
      estimatedDuration: build.estimatedDuration ?? null,
      displayName: build.displayName ?? null,
      fullDisplayName: build.fullDisplayName ?? null,
    };
  }

  private _toJenkinsOperation(operation: JenkinsOperationRecord): JenkinsOperation {
    const input = this._toRecord(operation.input);
    const result = this._toRecord(operation.result);
    const error = this._toRecord(operation.error);
    const jobName = this._stringField(result, 'jobName') ?? this._stringField(input, 'jobName');
    const buildNumber = this._numberField(result, 'buildNumber');
    const buildUrl = this._stringField(result, 'buildUrl');
    const queueUrl = this._stringField(result, 'queueUrl');
    const jenkinsResult = this._stringField(result, 'result');
    const errorMessage = this._stringField(error, 'message');
    const isTerminal =
      operation.status === 'SUCCEEDED' ||
      operation.status === 'FAILED' ||
      operation.status === 'REJECTED' ||
      operation.status === 'CANCELLED';

    return {
      id: operation.id,
      type: OperationType.JENKINS_BUILD_TRIGGER,
      status: operation.status,
      jobName: jobName ?? null,
      queueUrl: queueUrl ?? null,
      buildNumber: buildNumber ?? null,
      buildUrl: buildUrl ?? null,
      result: jenkinsResult ?? null,
      createdAt: operation.createdAt.toISOString(),
      startedAt: operation.status === 'QUEUED' ? null : operation.updatedAt.toISOString(),
      completedAt: isTerminal ? operation.updatedAt.toISOString() : null,
      durationMs: isTerminal ? operation.updatedAt.getTime() - operation.createdAt.getTime() : null,
      errorMessage: errorMessage ?? null,
    };
  }

  private _jobStatus(job: JenkinsApiJob): string {
    if (job.disabled) return 'DISABLED';
    if (job.inQueue) return 'QUEUED';
    if (job.color?.includes('anime')) return 'BUILDING';
    if (job.color?.startsWith('blue')) return 'SUCCESS';
    if (job.color?.startsWith('red')) return 'FAILED';
    if (job.color?.startsWith('yellow')) return 'UNSTABLE';
    return 'UNKNOWN';
  }

  private _toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private _stringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private _numberField(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private _policyFromOperation(input: Record<string, unknown>): {
    approvalReason: string | null;
    riskLevel: JenkinsTriggerBuildResponse['riskLevel'];
    policyName: string | null;
  } {
    const policy = this._toRecord(input.policy);
    return {
      approvalReason: this._stringField(policy, 'approvalReason'),
      riskLevel: this._riskLevel(policy),
      policyName: this._stringField(policy, 'policyName'),
    };
  }

  private _riskLevel(record: Record<string, unknown>): JenkinsTriggerBuildResponse['riskLevel'] {
    const value = record.riskLevel;
    return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : 'LOW';
  }

  private async _ingestBuildSignals(organizationId: string, builds: JenkinsBuild[]): Promise<void> {
    const signals = builds.flatMap((build) => {
      const jobName = build.jobName;
      const buildNumber = build.buildNumber;
      const result = build.result;
      const building = build.building;

      const signals: SignalIngestInput[] = [];

      if (building) {
        signals.push({
          source: SignalSource.JENKINS,
          type: SignalType.JENKINS_BUILD_STARTED,
          severity: SignalSeverity.INFO,
          title: `Jenkins Build Started: ${jobName} #${buildNumber}`,
          message: `Jenkins job ${jobName} build #${buildNumber} has started.`,
          metadata: { jobName, buildNumber, url: build.url },
          dedupeMode: 'EVENT' as const,
        });
      } else if (result === 'SUCCESS') {
        signals.push({
          source: SignalSource.JENKINS,
          type: SignalType.JENKINS_BUILD_SUCCEEDED,
          severity: SignalSeverity.INFO,
          title: `Jenkins Build Succeeded: ${jobName} #${buildNumber}`,
          message: `Jenkins job ${jobName} build #${buildNumber} succeeded.`,
          metadata: { jobName, buildNumber, result, url: build.url },
          dedupeMode: 'EVENT' as const,
        });
      } else if (result === 'FAILURE' || result === 'ABORTED' || result === 'UNSTABLE') {
        signals.push({
          source: SignalSource.JENKINS,
          type: SignalType.JENKINS_BUILD_FAILED,
          severity: result === 'FAILURE' ? SignalSeverity.ERROR : SignalSeverity.WARNING,
          title: `Jenkins Build ${result}: ${jobName} #${buildNumber}`,
          message: `Jenkins job ${jobName} build #${buildNumber} finished with status ${result}.`,
          metadata: { jobName, buildNumber, result, url: build.url },
          dedupeMode: 'EVENT' as const,
        });
      }

      return signals;
    });

    if (signals.length > 0) {
      void signalService.ingestSignals(organizationId, signals);
    }
  }
}

export const jenkinsService = new JenkinsService();
