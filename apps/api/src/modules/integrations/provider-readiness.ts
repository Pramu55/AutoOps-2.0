import {
  ProviderConnectionStatus,
  ProviderReadinessState,
  type ProviderReadiness,
} from '@autoops/types';

type ProviderReadinessInput = {
  status: string | null | undefined;
  configured?: boolean | null;
  checkedAt?: string | null;
  message?: string | null;
  remediation?: readonly string[] | string[] | null;
  reasonCode?: string | null;
};

const DEFAULT_MESSAGES: Record<ProviderReadinessState, string> = {
  [ProviderReadinessState.DISABLED]: 'Provider access is disabled.',
  [ProviderReadinessState.NOT_CONFIGURED]: 'Provider configuration is incomplete.',
  [ProviderReadinessState.UNREACHABLE]: 'Provider validation failed.',
  [ProviderReadinessState.CONNECTED]: 'Provider read-only validation passed.',
};

export function providerReadiness(input: ProviderReadinessInput): ProviderReadiness {
  const status = normalizeStatus(input.status);
  const state = readinessStateForStatus(status);
  const configured = configuredForState(state, input.configured);

  return {
    state,
    enabled: state !== ProviderReadinessState.DISABLED,
    configured,
    reachable: reachableForState(state),
    checkedAt: checkedAtForState(state, input.checkedAt),
    reasonCode: input.reasonCode ?? reasonCodeForStatus(status, state),
    message: sanitizeReadinessMessage(input.message) ?? DEFAULT_MESSAGES[state],
    remediation: input.remediation ? [...input.remediation] : null,
  };
}

export function withProviderReadiness<T extends ProviderReadinessInput>(
  input: T,
): T & { readiness: ProviderReadiness } {
  return {
    ...input,
    readiness: providerReadiness(input),
  };
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? 'UNKNOWN_ERROR').trim().toUpperCase();
}

function readinessStateForStatus(status: string): ProviderReadinessState {
  if (status === ProviderConnectionStatus.BLOCKED_BY_ORG_POLICY || status === 'DISABLED') {
    return ProviderReadinessState.DISABLED;
  }

  if (
    status === ProviderConnectionStatus.NOT_CONFIGURED ||
    status === 'NOT_INSTALLED' ||
    status === 'NOT_IMPLEMENTED'
  ) {
    return ProviderReadinessState.NOT_CONFIGURED;
  }

  if (status === ProviderConnectionStatus.CONNECTED) {
    return ProviderReadinessState.CONNECTED;
  }

  return ProviderReadinessState.UNREACHABLE;
}

function configuredForState(
  state: ProviderReadinessState,
  configured: boolean | null | undefined,
): boolean {
  if (state === ProviderReadinessState.CONNECTED) return true;
  if (state === ProviderReadinessState.UNREACHABLE) return configured ?? true;
  if (state === ProviderReadinessState.NOT_CONFIGURED) return false;
  return configured === true;
}

function reachableForState(state: ProviderReadinessState): boolean | null {
  if (state === ProviderReadinessState.CONNECTED) return true;
  if (state === ProviderReadinessState.UNREACHABLE) return false;
  return null;
}

function checkedAtForState(
  state: ProviderReadinessState,
  checkedAt: string | null | undefined,
): string | null {
  if (!checkedAt) return null;
  if (state === ProviderReadinessState.DISABLED || state === ProviderReadinessState.NOT_CONFIGURED)
    return checkedAt;
  return checkedAt;
}

function reasonCodeForStatus(status: string, state: ProviderReadinessState): string {
  if (state === ProviderReadinessState.DISABLED)
    return status === 'DISABLED' ? 'PROVIDER_DISABLED' : status;
  if (state === ProviderReadinessState.NOT_CONFIGURED) return status;
  if (state === ProviderReadinessState.CONNECTED) return 'READ_ONLY_VALIDATION_PASSED';
  return status || 'UNKNOWN_ERROR';
}

function sanitizeReadinessMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message.replace(
    /(token|password|secret|api[_ -]?key)(\s*[:=]\s*|\s+)([^,\s]+)/gi,
    '$1$2[redacted]',
  );
}
