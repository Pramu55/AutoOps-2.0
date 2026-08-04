import { constants as fsConstants, promises as fs, type BigIntStats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

const REDACTED = '[REDACTED]';
const INSPECT = Symbol.for('nodejs.util.inspect.custom');

export const SECRET_IDS = [
  'auth.jwtAccess',
  'auth.jwtRefresh',
  'githubActions.token',
  'jenkins.apiToken',
] as const;

export type SecretId = (typeof SECRET_IDS)[number];
export type SecretProviderMode = 'env' | 'file';
export type SecretProviderKind = 'environment' | 'mounted-file';
export type SecretRequirement = 'required' | 'optional';

export interface SecretDescriptor {
  id: SecretId;
  environmentVariable: string;
  fileName: string;
  defaultRequirement: SecretRequirement;
  subsystem: 'auth' | 'github-actions' | 'jenkins';
  stripSingleTrailingNewline: boolean;
}

export const SECRET_DESCRIPTORS: Readonly<Record<SecretId, SecretDescriptor>> = Object.freeze({
  'auth.jwtAccess': Object.freeze({
    id: 'auth.jwtAccess',
    environmentVariable: 'JWT_SECRET',
    fileName: 'jwt-access',
    defaultRequirement: 'required',
    subsystem: 'auth',
    stripSingleTrailingNewline: true,
  }),
  'auth.jwtRefresh': Object.freeze({
    id: 'auth.jwtRefresh',
    environmentVariable: 'JWT_REFRESH_SECRET',
    fileName: 'jwt-refresh',
    defaultRequirement: 'required',
    subsystem: 'auth',
    stripSingleTrailingNewline: true,
  }),
  'githubActions.token': Object.freeze({
    id: 'githubActions.token',
    environmentVariable: 'GITHUB_ACTIONS_TOKEN',
    fileName: 'github-actions-token',
    defaultRequirement: 'optional',
    subsystem: 'github-actions',
    stripSingleTrailingNewline: true,
  }),
  'jenkins.apiToken': Object.freeze({
    id: 'jenkins.apiToken',
    environmentVariable: 'JENKINS_API_TOKEN',
    fileName: 'jenkins-api-token',
    defaultRequirement: 'optional',
    subsystem: 'jenkins',
    stripSingleTrailingNewline: true,
  }),
});

export type SecretProviderErrorCode =
  | 'SECRET_PROVIDER_MODE_INVALID'
  | 'SECRET_REQUIRED_MISSING'
  | 'SECRET_FILE_OUTSIDE_ROOT'
  | 'SECRET_FILE_INVALID_TYPE'
  | 'SECRET_FILE_READ_FAILED'
  | 'SECRET_EMPTY'
  | 'SECRET_RESOLUTION_FAILED';

export class SecretProviderError extends Error {
  readonly name = 'SecretProviderError';

  constructor(
    public readonly code: SecretProviderErrorCode,
    public readonly secretId?: SecretId,
    public readonly mode?: string,
  ) {
    super(`${code}${secretId ? `: ${secretId}` : ''}`);
  }

  toJSON(): Record<string, string | undefined> {
    return { name: this.name, code: this.code, secretId: this.secretId, mode: this.mode };
  }
}

/**
 * Reduces accidental logging and serialization; it is not cryptographic memory protection.
 */
export class SecretValue {
  #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static fromResolved(
    value: string,
    descriptor: SecretDescriptor,
    requirement: SecretRequirement,
  ): SecretValue | null {
    if (value.trim().length === 0) {
      if (requirement === 'required') {
        throw new SecretProviderError('SECRET_EMPTY', descriptor.id);
      }
      return null;
    }
    return new SecretValue(value);
  }

  revealForUse(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [INSPECT](): string {
    return 'SecretValue [REDACTED]';
  }
}

export interface SecretProviderReadiness {
  mode: SecretProviderMode;
  status: 'READY' | 'DEGRADED_LEGACY_ENV_MODE' | 'BLOCKED_MISSING_REQUIRED_SECRET';
  requiredMissingCount: number;
  optionalUnavailableCount: number;
}

export interface SecretProvider {
  readonly kind: SecretProviderKind;
  readonly mode: SecretProviderMode;
  resolve(
    descriptor: SecretDescriptor,
    requirement?: SecretRequirement,
  ): Promise<SecretValue | null>;
  readiness(): SecretProviderReadiness;
}

export interface CreateSecretProviderOptions {
  mode: string | undefined;
  environment?: NodeJS.ProcessEnv;
  fileRoot?: string;
  production?: boolean;
  /** Internal test seam for deterministic filesystem race verification. */
  fileSystem?: MountedSecretFileSystem;
}

export interface MountedSecretFileSystem {
  realpath(path: string): Promise<string>;
  open(path: string, flags: number): Promise<FileHandle>;
  stat(path: string, options: { bigint: true }): Promise<BigIntStats>;
}

abstract class BaseSecretProvider implements SecretProvider {
  protected requiredMissingCount = 0;
  protected optionalUnavailableCount = 0;

  abstract readonly kind: SecretProviderKind;
  abstract readonly mode: SecretProviderMode;

  abstract resolve(
    descriptor: SecretDescriptor,
    requirement?: SecretRequirement,
  ): Promise<SecretValue | null>;

  readiness(): SecretProviderReadiness {
    return {
      mode: this.mode,
      status:
        this.requiredMissingCount > 0
          ? 'BLOCKED_MISSING_REQUIRED_SECRET'
          : this.mode === 'env' && this.production
            ? 'DEGRADED_LEGACY_ENV_MODE'
            : 'READY',
      requiredMissingCount: this.requiredMissingCount,
      optionalUnavailableCount: this.optionalUnavailableCount,
    };
  }

  constructor(private readonly production: boolean) {}

  protected absent(descriptor: SecretDescriptor, requirement: SecretRequirement): null {
    if (requirement === 'required') {
      this.requiredMissingCount += 1;
      throw new SecretProviderError('SECRET_REQUIRED_MISSING', descriptor.id, this.mode);
    }
    this.optionalUnavailableCount += 1;
    return null;
  }

  protected assertRegistered(descriptor: SecretDescriptor): void {
    if (SECRET_DESCRIPTORS[descriptor.id] !== descriptor) {
      throw new SecretProviderError('SECRET_RESOLUTION_FAILED', descriptor.id, this.mode);
    }
  }

  protected resolved(
    value: string,
    descriptor: SecretDescriptor,
    requirement: SecretRequirement,
  ): SecretValue | null {
    try {
      const secret = SecretValue.fromResolved(value, descriptor, requirement);
      if (!secret) this.optionalUnavailableCount += 1;
      return secret;
    } catch (error) {
      if (error instanceof SecretProviderError) {
        this.requiredMissingCount += 1;
      }
      throw error;
    }
  }
}

class EnvironmentSecretProvider extends BaseSecretProvider {
  readonly kind = 'environment' as const;
  readonly mode = 'env' as const;

  constructor(
    private readonly environment: NodeJS.ProcessEnv,
    production: boolean,
  ) {
    super(production);
  }

  async resolve(
    descriptor: SecretDescriptor,
    requirement = descriptor.defaultRequirement,
  ): Promise<SecretValue | null> {
    this.assertRegistered(descriptor);
    const value = this.environment[descriptor.environmentVariable];
    if (value === undefined) return this.absent(descriptor, requirement);
    return this.resolved(value, descriptor, requirement);
  }
}

class MountedFileSecretProvider extends BaseSecretProvider {
  readonly kind = 'mounted-file' as const;
  readonly mode = 'file' as const;

  constructor(
    private readonly root: string,
    production: boolean,
    private readonly fileSystem: MountedSecretFileSystem,
  ) {
    super(production);
  }

  async resolve(
    descriptor: SecretDescriptor,
    requirement = descriptor.defaultRequirement,
  ): Promise<SecretValue | null> {
    try {
      this.assertRegistered(descriptor);
      const root = await canonicalizeRoot(this.root, descriptor, this.mode, this.fileSystem);
      const candidate = path.resolve(root, descriptor.fileName);
      if (!isWithinRoot(root, candidate)) {
        throw new SecretProviderError('SECRET_FILE_OUTSIDE_ROOT', descriptor.id, this.mode);
      }

      let handle: FileHandle;
      try {
        handle = await this.fileSystem.open(candidate, fsConstants.O_RDONLY);
      } catch (error) {
        if (isMissing(error)) return this.absent(descriptor, requirement);
        throw new SecretProviderError('SECRET_FILE_READ_FAILED', descriptor.id, this.mode);
      }

      try {
        const openedMetadata = await handle.stat({ bigint: true });
        if (!openedMetadata.isFile()) {
          throw new SecretProviderError('SECRET_FILE_INVALID_TYPE', descriptor.id, this.mode);
        }

        // A path can be retargeted after open.  Re-resolve it only to prove that
        // the open descriptor still names the same contained object; read only
        // through the already opened descriptor after that proof succeeds.
        const canonicalTarget = await this.fileSystem.realpath(candidate);
        if (!isWithinRoot(root, canonicalTarget)) {
          throw new SecretProviderError('SECRET_FILE_OUTSIDE_ROOT', descriptor.id, this.mode);
        }
        const canonicalMetadata = await this.fileSystem.stat(canonicalTarget, { bigint: true });
        if (!canonicalMetadata.isFile() || !sameFileIdentity(openedMetadata, canonicalMetadata)) {
          throw new SecretProviderError('SECRET_FILE_READ_FAILED', descriptor.id, this.mode);
        }

        let value: string;
        try {
          value = await handle.readFile({ encoding: 'utf8' });
        } catch {
          throw new SecretProviderError('SECRET_FILE_READ_FAILED', descriptor.id, this.mode);
        }
        if (value.includes('\0')) {
          throw new SecretProviderError('SECRET_FILE_READ_FAILED', descriptor.id, this.mode);
        }
        if (descriptor.stripSingleTrailingNewline) {
          value = value.replace(/\r?\n$/, '');
        }
        return this.resolved(value, descriptor, requirement);
      } finally {
        await handle.close().catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof SecretProviderError) throw error;
      throw new SecretProviderError('SECRET_RESOLUTION_FAILED', descriptor.id, this.mode);
    }
  }
}

async function canonicalizeRoot(
  root: string,
  descriptor: SecretDescriptor,
  mode: SecretProviderMode,
  fileSystem: MountedSecretFileSystem,
): Promise<string> {
  try {
    return await fileSystem.realpath(root);
  } catch {
    throw new SecretProviderError('SECRET_FILE_READ_FAILED', descriptor.id, mode);
  }
}

function sameFileIdentity(opened: BigIntStats, canonical: BigIntStats): boolean {
  // Node exposes device/inode identity on every supported runtime.  Refuse to
  // use a path fallback if either identity is unavailable or not a bigint.
  return (
    typeof opened.dev === 'bigint' &&
    typeof opened.ino === 'bigint' &&
    typeof canonical.dev === 'bigint' &&
    typeof canonical.ino === 'bigint' &&
    opened.dev === canonical.dev &&
    opened.ino === canonical.ino
  );
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isWithinRoot(root: string, target: string): boolean {
  const canonicalRoot = process.platform === 'win32' ? root.toLocaleLowerCase() : root;
  const canonicalTarget = process.platform === 'win32' ? target.toLocaleLowerCase() : target;
  const relative = path.relative(canonicalRoot, canonicalTarget);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

export function getSecretDescriptor(id: SecretId): SecretDescriptor {
  return SECRET_DESCRIPTORS[id];
}

export function createSecretProvider(options: CreateSecretProviderOptions): SecretProvider {
  const mode = options.mode ?? 'env';
  const production = options.production ?? false;
  if (mode === 'env')
    return new EnvironmentSecretProvider(options.environment ?? process.env, production);
  if (mode === 'file')
    return new MountedFileSecretProvider(
      options.fileRoot ?? '/run/secrets/autoops',
      production,
      options.fileSystem ?? fs,
    );
  throw new SecretProviderError('SECRET_PROVIDER_MODE_INVALID', undefined, mode);
}
