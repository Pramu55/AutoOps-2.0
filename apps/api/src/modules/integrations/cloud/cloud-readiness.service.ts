import type { CloudProviderReadiness, CloudReadinessStatusResponse } from '@autoops/types';
import { CloudReadinessStatus, ProviderConnectionStatus } from '@autoops/types';
import { awsService } from '../aws/aws.service.js';

export class CloudReadinessService {
  async getStatus(): Promise<CloudReadinessStatusResponse> {
    const [aws, azure, gcp] = await Promise.all([this.getAws(), this.getAzure(), this.getGcp()]);
    return {
      providers: [aws, azure, gcp],
      generatedAt: new Date().toISOString(),
    };
  }

  async getAws(): Promise<CloudProviderReadiness> {
    const enabled = process.env.AWS_INTEGRATION_ENABLED === 'true';
    if (!enabled) {
      return this._provider('aws', 'AWS', CloudReadinessStatus.NOT_CONFIGURED, false, 'AWS readiness is disabled. Enable only with read-only credentials.', null, process.env.AWS_REGION?.trim() || null);
    }

    const status = await awsService.getStatus();
    const mapped = this._mapProviderStatus(status.status);
    return this._provider(
      'aws',
      'AWS',
      mapped,
      status.configured,
      status.message,
      status.accountId ? `Account ${status.accountId}` : null,
      status.region ?? null,
    );
  }

  async getAzure(): Promise<CloudProviderReadiness> {
    const enabled = process.env.AZURE_INTEGRATION_ENABLED === 'true';
    const configured = Boolean(
      process.env.AZURE_TENANT_ID?.trim() &&
        process.env.AZURE_CLIENT_ID?.trim() &&
        process.env.AZURE_CLIENT_SECRET?.trim() &&
        process.env.AZURE_SUBSCRIPTION_ID?.trim(),
    );
    if (!enabled || !configured) {
      return this._provider('azure', 'Azure', CloudReadinessStatus.NOT_CONFIGURED, false, 'Azure credentials are not configured. Direct Azure writes are intentionally not implemented.', null, null);
    }
    return this._provider('azure', 'Azure', CloudReadinessStatus.NOT_IMPLEMENTED, true, 'Azure credential detection is present; live Azure API checks are future scoped.', null, null);
  }

  async getGcp(): Promise<CloudProviderReadiness> {
    const enabled = process.env.GCP_INTEGRATION_ENABLED === 'true';
    const configured = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
    if (!enabled || !configured) {
      return this._provider('gcp', 'GCP', CloudReadinessStatus.NOT_CONFIGURED, false, 'GCP credentials are not configured. Direct GCP writes are intentionally not implemented.', null, null);
    }
    return this._provider('gcp', 'GCP', CloudReadinessStatus.NOT_IMPLEMENTED, true, 'GCP credential detection is present; live GCP API checks are future scoped.', null, null);
  }

  private _provider(
    provider: CloudProviderReadiness['provider'],
    displayName: string,
    status: CloudReadinessStatus,
    configured: boolean,
    message: string,
    accountSummary: string | null,
    region: string | null,
  ): CloudProviderReadiness {
    return {
      provider,
      displayName,
      status,
      configured,
      checkedAt: new Date().toISOString(),
      message,
      accountSummary,
      region,
      safeReadChecks:
        provider === 'aws'
          ? ['STS GetCallerIdentity when configured', 'No cloud resource mutation']
          : ['Credential presence detection only', 'No cloud resource mutation'],
      writeModel: 'Cloud writes are future-scoped and should flow through approval-gated Terraform/OpenTofu automation.',
    };
  }

  private _mapProviderStatus(status: ProviderConnectionStatus): CloudReadinessStatus {
    if (status === ProviderConnectionStatus.CONNECTED) return CloudReadinessStatus.CONNECTED;
    if (status === ProviderConnectionStatus.AUTH_FAILED || status === ProviderConnectionStatus.FORBIDDEN) return CloudReadinessStatus.AUTH_FAILED;
    if (status === ProviderConnectionStatus.NOT_CONFIGURED) return CloudReadinessStatus.NOT_CONFIGURED;
    if (status === ProviderConnectionStatus.UNREACHABLE) return CloudReadinessStatus.UNREACHABLE;
    return CloudReadinessStatus.ERROR;
  }
}

export const cloudReadinessService = new CloudReadinessService();
