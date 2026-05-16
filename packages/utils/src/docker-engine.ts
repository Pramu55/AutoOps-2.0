import { existsSync } from 'node:fs';
import http, { type RequestOptions } from 'node:http';
import { URL } from 'node:url';

export type DockerEngineConfig =
  | { configured: false; message: string }
  | { configured: true; socketPath?: string; host?: string; port?: number; protocol: 'http:' };

export type DockerVersionInfo = {
  Version?: string;
  ApiVersion?: string;
  Os?: string;
  Arch?: string;
};

export type DockerContainerPort = {
  PrivatePort?: number;
  PublicPort?: number;
  Type?: string;
  IP?: string;
};

export type DockerContainerSummary = {
  Id?: string;
  Names?: string[];
  Image?: string;
  ImageID?: string;
  State?: string;
  Status?: string;
  Ports?: DockerContainerPort[];
  Created?: number;
  Labels?: Record<string, string>;
};

export type DockerImageSummary = {
  Id?: string;
  RepoTags?: string[];
  Size?: number;
  Created?: number;
};

export type DockerNetworkSummary = {
  Id?: string;
  Name?: string;
  Driver?: string;
  Scope?: string;
};

export type DockerVolumeSummary = {
  Name?: string;
  Driver?: string;
  CreatedAt?: string;
};

export type DockerVolumeList = {
  Volumes?: DockerVolumeSummary[];
};

type DockerRequestOptions = {
  method?: 'GET' | 'POST';
  timeoutMs?: number;
};

const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';
const DEFAULT_TIMEOUT_MS = 10_000;

export function getDockerEngineConfig(): DockerEngineConfig {
  const dockerHost = process.env.DOCKER_HOST?.trim();
  if (dockerHost) {
    if (dockerHost.startsWith('tcp://')) {
      const parsed = new URL(dockerHost.replace(/^tcp:\/\//, 'http://'));
      return {
        configured: true,
        protocol: 'http:',
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 2375,
      };
    }

    if (dockerHost.startsWith('unix://')) {
      const socketPath = dockerHost.replace(/^unix:\/\//, '');
      return { configured: true, protocol: 'http:', socketPath };
    }

    return {
      configured: false,
      message: 'Docker connector does not support the configured DOCKER_HOST scheme.',
    };
  }

  const socketPath = process.env.DOCKER_SOCKET_PATH?.trim() || DEFAULT_SOCKET_PATH;
  if (!existsSync(socketPath)) {
    return {
      configured: false,
      message: 'Docker connector is not configured. Mount the Docker socket or set DOCKER_HOST.',
    };
  }

  return { configured: true, protocol: 'http:', socketPath };
}

export class DockerEngineClient {
  constructor(private readonly config = getDockerEngineConfig()) {}

  isConfigured(): boolean {
    return this.config.configured;
  }

  notConfiguredMessage(): string {
    return this.config.configured ? 'Docker connector is configured.' : this.config.message;
  }

  async ping(): Promise<void> {
    await this.requestText('/_ping');
  }

  async version(): Promise<DockerVersionInfo> {
    return this.requestJson<DockerVersionInfo>('/version');
  }

  async listContainers(): Promise<DockerContainerSummary[]> {
    return this.requestJson<DockerContainerSummary[]>('/containers/json?all=1');
  }

  async listImages(): Promise<DockerImageSummary[]> {
    return this.requestJson<DockerImageSummary[]>('/images/json');
  }

  async listNetworks(): Promise<DockerNetworkSummary[]> {
    return this.requestJson<DockerNetworkSummary[]>('/networks');
  }

  async listVolumes(): Promise<DockerVolumeList> {
    return this.requestJson<DockerVolumeList>('/volumes');
  }

  async logs(containerId: string, tail: number, timestamps: boolean): Promise<string[]> {
    const buffer = await this.requestBuffer(
      `/containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=${timestamps ? '1' : '0'}`,
    );
    return decodeDockerLogs(buffer)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .slice(-tail);
  }

  async startContainer(containerId: string): Promise<void> {
    await this.requestText(`/containers/${encodeURIComponent(containerId)}/start`, { method: 'POST' });
  }

  async stopContainer(containerId: string): Promise<void> {
    await this.requestText(`/containers/${encodeURIComponent(containerId)}/stop`, { method: 'POST' });
  }

  async restartContainer(containerId: string): Promise<void> {
    await this.requestText(`/containers/${encodeURIComponent(containerId)}/restart`, { method: 'POST' });
  }

  private async requestJson<T>(path: string, options: DockerRequestOptions = {}): Promise<T> {
    const text = await this.requestText(path, options);
    return JSON.parse(text || 'null') as T;
  }

  private async requestText(path: string, options: DockerRequestOptions = {}): Promise<string> {
    return (await this.requestBuffer(path, options)).toString('utf8');
  }

  private requestBuffer(path: string, options: DockerRequestOptions = {}): Promise<Buffer> {
    if (!this.config.configured) {
      return Promise.reject(new DockerEngineError(this.config.message, 'NOT_CONFIGURED'));
    }

    const requestOptions: RequestOptions = {
      method: options.method ?? 'GET',
      path,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    if (this.config.socketPath) {
      requestOptions.socketPath = this.config.socketPath;
    } else {
      requestOptions.protocol = this.config.protocol;
      requestOptions.hostname = this.config.host;
      requestOptions.port = this.config.port;
    }

    return new Promise((resolve, reject) => {
      const request = http.request(requestOptions, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks);
          const statusCode = response.statusCode ?? 0;
          if ((statusCode >= 200 && statusCode < 300) || statusCode === 304) {
            resolve(body);
            return;
          }

          reject(
            new DockerEngineError(
              safeDockerErrorMessage(statusCode, body.toString('utf8')),
              statusCode === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
              statusCode,
            ),
          );
        });
      });

      request.on('timeout', () => {
        request.destroy(new DockerEngineError('Docker engine request timed out.', 'TIMEOUT'));
      });
      request.on('error', (error) => reject(toDockerEngineError(error)));
      request.end();
    });
  }
}

export class DockerEngineError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONFIGURED' | 'UNREACHABLE' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'TIMEOUT' | 'REQUEST_FAILED',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'DockerEngineError';
  }
}

export function toDockerEngineError(error: unknown): DockerEngineError {
  if (error instanceof DockerEngineError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('permission denied') || normalized.includes('eacces')) {
    return new DockerEngineError('Docker access was denied.', 'PERMISSION_DENIED');
  }
  if (
    normalized.includes('enoent') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('socket hang up')
  ) {
    return new DockerEngineError('Docker engine could not be reached.', 'UNREACHABLE');
  }
  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return new DockerEngineError('Docker engine request timed out.', 'TIMEOUT');
  }

  return new DockerEngineError('Docker engine request failed.', 'REQUEST_FAILED');
}

function safeDockerErrorMessage(statusCode: number, body: string): string {
  const parsed = tryParseRecord(body);
  const message = typeof parsed.message === 'string' ? parsed.message : body;
  const safeMessage = message.replace(/\s+/g, ' ').trim();
  return safeMessage
    ? `Docker engine request failed with HTTP ${statusCode}: ${safeMessage}`
    : `Docker engine request failed with HTTP ${statusCode}.`;
}

function tryParseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function decodeDockerLogs(buffer: Buffer): string {
  if (buffer.length < 8) return buffer.toString('utf8');

  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const nextOffset = offset + 8 + size;
    if ((stream !== 1 && stream !== 2) || size < 0 || nextOffset > buffer.length) {
      return buffer.toString('utf8');
    }
    chunks.push(buffer.subarray(offset + 8, nextOffset));
    offset = nextOffset;
  }

  if (offset !== buffer.length) return buffer.toString('utf8');
  return Buffer.concat(chunks).toString('utf8');
}
