import {
  createSecretProvider,
  getSecretDescriptor,
  type SecretProviderReadiness,
  type SecretValue,
} from '@autoops/utils';
import { env } from './env.js';

let jenkinsApiToken: SecretValue | null | undefined;
let readiness: SecretProviderReadiness | undefined;
let initialized = false;

/** Worker-local bootstrap: the worker is a separate process from the API. */
export async function initializeWorkerSecrets(): Promise<SecretProviderReadiness> {
  if (initialized) throw new Error('Worker secrets have already been initialized.');

  const provider = createSecretProvider({
    mode: env.SECRET_PROVIDER_MODE,
    fileRoot: env.SECRET_PROVIDER_ROOT,
    production: env.NODE_ENV === 'production',
  });
  jenkinsApiToken = env.JENKINS_INTEGRATION_ENABLED
    ? await provider.resolve(getSecretDescriptor('jenkins.apiToken'), 'required')
    : null;
  readiness = provider.readiness();
  initialized = true;
  return readiness;
}

export function getWorkerJenkinsApiToken(): SecretValue | null {
  if (!initialized) throw new Error('Worker secrets have not been initialized.');
  return env.JENKINS_INTEGRATION_ENABLED ? (jenkinsApiToken ?? null) : null;
}

export function resetWorkerSecretsForTests(): void {
  if (env.NODE_ENV !== 'test') throw new Error('Worker secret reset is test-only.');
  jenkinsApiToken = undefined;
  readiness = undefined;
  initialized = false;
}
