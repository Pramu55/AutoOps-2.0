import { ProviderConnectionStatus } from '@autoops/types';

export interface JenkinsConfig {
  configured: boolean;
  baseUrl?: string;
  username?: string;
  allowedJobs: string[];
  timeoutMs: number;
  triggerPollTimeoutMs: number;
  triggerPollIntervalMs: number;
  message: string;
}

export interface JenkinsRequestResult<T> {
  data: T;
  headers: Headers;
  status: number;
}

export interface JenkinsCrumb {
  crumbRequestField: string;
  crumb: string;
}

export class JenkinsRequestError extends Error {
  constructor(
    message: string,
    public readonly status: ProviderConnectionStatus,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'JenkinsRequestError';
  }
}

export function getJenkinsConfiguration(): JenkinsConfig {
  const rawUrl = process.env.JENKINS_URL?.trim();
  const username = process.env.JENKINS_USERNAME?.trim();
  const token = process.env.JENKINS_API_TOKEN?.trim();
  const timeoutMs = numberEnv('JENKINS_REQUEST_TIMEOUT_MS', 10_000);
  const triggerPollTimeoutMs = numberEnv('JENKINS_TRIGGER_POLL_TIMEOUT_MS', 120_000);
  const triggerPollIntervalMs = numberEnv('JENKINS_TRIGGER_POLL_INTERVAL_MS', 2_000);
  const allowedJobs = parseAllowedJobs(process.env.JENKINS_ALLOWED_JOBS);

  if (!rawUrl) {
    return {
      configured: false,
      allowedJobs,
      timeoutMs,
      triggerPollTimeoutMs,
      triggerPollIntervalMs,
      message: 'JENKINS_URL is required for Jenkins discovery.',
    };
  }

  let baseUrl: string;
  try {
    baseUrl = new URL(rawUrl).toString().replace(/\/+$/, '');
  } catch {
    return {
      configured: false,
      allowedJobs,
      timeoutMs,
      triggerPollTimeoutMs,
      triggerPollIntervalMs,
      message: 'JENKINS_URL must be a valid URL.',
    };
  }

  if (!username || !token) {
    return {
      configured: false,
      baseUrl,
      username,
      allowedJobs,
      timeoutMs,
      triggerPollTimeoutMs,
      triggerPollIntervalMs,
      message: 'JENKINS_USERNAME and JENKINS_API_TOKEN are required for Jenkins discovery.',
    };
  }

  return {
    configured: true,
    baseUrl,
    username,
    allowedJobs,
    timeoutMs,
    triggerPollTimeoutMs,
    triggerPollIntervalMs,
    message: 'Jenkins environment credentials are configured.',
  };
}

export function parseAllowedJobs(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function classifyJenkinsError(error: unknown): ProviderConnectionStatus {
  if (error instanceof JenkinsRequestError) return error.status;
  if (error instanceof TypeError) return ProviderConnectionStatus.UNREACHABLE;
  if (error instanceof Error && error.name === 'AbortError') return ProviderConnectionStatus.UNREACHABLE;
  return ProviderConnectionStatus.UNKNOWN_ERROR;
}

export function safeJenkinsMessage(error: unknown): string {
  if (error instanceof JenkinsRequestError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') return 'Jenkins request timed out.';
  if (error instanceof TypeError) return 'Jenkins is unreachable.';
  if (error instanceof Error) return redactJenkinsSecrets(error.message);
  return 'Jenkins request failed.';
}

export class JenkinsClient {
  constructor(private readonly config = getJenkinsConfiguration()) {}

  get baseUrl(): string {
    if (!this.config.baseUrl) throw new JenkinsRequestError('Jenkins is not configured.', ProviderConnectionStatus.NOT_CONFIGURED);
    return this.config.baseUrl;
  }

  get username(): string | undefined {
    return this.config.username;
  }

  get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  get triggerPollTimeoutMs(): number {
    return this.config.triggerPollTimeoutMs;
  }

  get triggerPollIntervalMs(): number {
    return this.config.triggerPollIntervalMs;
  }

  async getJson<T>(pathOrUrl: string): Promise<JenkinsRequestResult<T>> {
    return this.requestJson<T>('GET', pathOrUrl);
  }

  async post(pathOrUrl: string, body?: URLSearchParams): Promise<JenkinsRequestResult<unknown>> {
    const headers: Record<string, string> = {};
    const crumb = await this.getCrumb();
    if (crumb) headers[crumb.crumbRequestField] = crumb.crumb;
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

    return this.requestJson<unknown>('POST', pathOrUrl, {
      headers,
      body,
      tolerateEmptyBody: true,
    });
  }

  async getCrumb(): Promise<JenkinsCrumb | null> {
    try {
      const response = await this.getJson<JenkinsCrumb>('/crumbIssuer/api/json');
      if (response.data.crumb && response.data.crumbRequestField) return response.data;
      return null;
    } catch (error) {
      if (error instanceof JenkinsRequestError && error.httpStatus === 404) return null;
      if (error instanceof JenkinsRequestError && error.status === ProviderConnectionStatus.FORBIDDEN) return null;
      throw error;
    }
  }

  jobPath(jobName: string): string {
    return jobName
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `/job/${encodeURIComponent(part)}`)
      .join('');
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    pathOrUrl: string,
    options: {
      headers?: Record<string, string>;
      body?: URLSearchParams;
      tolerateEmptyBody?: boolean;
    } = {},
  ): Promise<JenkinsRequestResult<T>> {
    if (!this.config.configured || !this.config.baseUrl || !this.config.username) {
      throw new JenkinsRequestError(this.config.message, ProviderConnectionStatus.NOT_CONFIGURED);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.config.baseUrl}${pathOrUrl}`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: basicAuthHeader(this.config.username, process.env.JENKINS_API_TOKEN ?? ''),
          Accept: 'application/json',
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new JenkinsRequestError(
          statusMessage(response.status),
          statusFromCode(response.status),
          response.status,
        );
      }

      const text = await response.text();
      if (!text && options.tolerateEmptyBody) {
        return { data: {} as T, headers: response.headers, status: response.status };
      }

      try {
        return { data: JSON.parse(text) as T, headers: response.headers, status: response.status };
      } catch {
        if (options.tolerateEmptyBody) return { data: {} as T, headers: response.headers, status: response.status };
        throw new JenkinsRequestError('Jenkins returned invalid JSON.', ProviderConnectionStatus.UNKNOWN_ERROR);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function basicAuthHeader(username: string, token: string): string {
  return `Basic ${Buffer.from(`${username}:${token}`, 'utf8').toString('base64')}`;
}

function statusFromCode(status: number): ProviderConnectionStatus {
  if (status === 401) return ProviderConnectionStatus.AUTH_FAILED;
  if (status === 403) return ProviderConnectionStatus.FORBIDDEN;
  if (status >= 500) return ProviderConnectionStatus.UNREACHABLE;
  return ProviderConnectionStatus.UNKNOWN_ERROR;
}

function statusMessage(status: number): string {
  if (status === 401) return 'Jenkins authentication failed.';
  if (status === 403) return 'Jenkins request is forbidden.';
  if (status === 404) return 'Jenkins resource was not found.';
  if (status >= 500) return 'Jenkins is unreachable or returned a server error.';
  return `Jenkins request failed with HTTP ${status}.`;
}

function numberEnv(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function redactJenkinsSecrets(message: string): string {
  const token = process.env.JENKINS_API_TOKEN;
  return token ? message.replaceAll(token, '[REDACTED]') : message;
}
