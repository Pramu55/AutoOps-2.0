import {
  createSecretProvider,
  getSecretDescriptor,
  type SecretProviderReadiness,
  type SecretValue,
} from '@autoops/utils';
import { env } from './env.js';

type ApplicationSecrets = {
  jwtAccess: SecretValue;
  jwtRefresh: SecretValue;
  githubActionsToken: SecretValue | null;
  jenkinsApiToken: SecretValue | null;
};

let resolved: ApplicationSecrets | undefined;
let readiness: SecretProviderReadiness | undefined;
let initializationCompleted = false;

function assertProductionJwtSecrets(access: SecretValue, refresh: SecretValue): void {
  if (env.NODE_ENV !== 'production') return;
  const placeholder =
    /change-me|replace-me|please-change|local-only|autoops_dev|^secret$|^password$|^default$/i;
  const accessValue = access.revealForUse();
  const refreshValue = refresh.revealForUse();
  if (
    accessValue.length < 32 ||
    refreshValue.length < 32 ||
    placeholder.test(accessValue) ||
    placeholder.test(refreshValue)
  ) {
    throw new Error('Secret provider rejected production JWT configuration.');
  }
  if (accessValue === refreshValue) {
    throw new Error('Secret provider requires distinct production JWT secrets.');
  }
}

/**
 * The existing API uses module-level route/service instances. Bootstrap calls this
 * exactly once before database connection or HTTP listening; consumers can only
 * retrieve individual typed values, never a serializable secret snapshot.
 */
export async function initializeApplicationSecrets(): Promise<SecretProviderReadiness> {
  if (initializationCompleted) {
    throw new Error('Application secrets have already been initialized.');
  }

  const provider = createSecretProvider({
    mode: env.SECRET_PROVIDER_MODE,
    fileRoot: env.SECRET_PROVIDER_ROOT,
    production: env.NODE_ENV === 'production',
  });
  const jwtAccess = await provider.resolve(getSecretDescriptor('auth.jwtAccess'), 'required');
  const jwtRefresh = await provider.resolve(getSecretDescriptor('auth.jwtRefresh'), 'required');
  const githubActionsToken = await provider.resolve(
    getSecretDescriptor('githubActions.token'),
    env.GITHUB_ACTIONS_ENABLED ? 'required' : 'optional',
  );
  // A disabled integration must not resolve or retain a stale credential.
  const jenkinsApiToken = env.JENKINS_INTEGRATION_ENABLED
    ? await provider.resolve(getSecretDescriptor('jenkins.apiToken'), 'required')
    : null;

  if (!jwtAccess || !jwtRefresh) {
    throw new Error('Secret provider did not resolve required JWT configuration.');
  }
  assertProductionJwtSecrets(jwtAccess, jwtRefresh);
  resolved = Object.freeze({ jwtAccess, jwtRefresh, githubActionsToken, jenkinsApiToken });
  readiness = provider.readiness();
  initializationCompleted = true;
  return readiness;
}

function getResolved(): ApplicationSecrets {
  if (!resolved) throw new Error('Application secrets have not been initialized.');
  return resolved;
}

export function getJwtSecret(kind: 'access' | 'refresh'): SecretValue {
  const secrets = getResolved();
  return kind === 'access' ? secrets.jwtAccess : secrets.jwtRefresh;
}

export function getGitHubActionsToken(): SecretValue | null {
  return getResolved().githubActionsToken;
}

export function getJenkinsApiToken(): SecretValue | null {
  return env.JENKINS_INTEGRATION_ENABLED ? getResolved().jenkinsApiToken : null;
}

export function getSecretProviderReadiness(): SecretProviderReadiness {
  if (!readiness) throw new Error('Application secrets have not been initialized.');
  return readiness;
}

export function resetApplicationSecretsForTests(): void {
  if (env.NODE_ENV !== 'test') throw new Error('Secret reset is test-only.');
  resolved = undefined;
  readiness = undefined;
  initializationCompleted = false;
}
