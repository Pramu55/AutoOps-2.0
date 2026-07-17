import { describe, expect, it } from 'vitest';
import { ProviderReadinessState } from '@autoops/types';
import { providerReadiness } from './provider-readiness.js';

describe('providerReadiness', () => {
  it.each([
    ['BLOCKED_BY_ORG_POLICY', ProviderReadinessState.DISABLED, false, null],
    ['NOT_IMPLEMENTED', ProviderReadinessState.NOT_CONFIGURED, false, null],
    ['NOT_CONFIGURED', ProviderReadinessState.NOT_CONFIGURED, false, null],
    ['NOT_INSTALLED', ProviderReadinessState.NOT_CONFIGURED, false, null],
    ['UNREACHABLE', ProviderReadinessState.UNREACHABLE, true, false],
    ['AUTH_FAILED', ProviderReadinessState.UNREACHABLE, true, false],
    ['FORBIDDEN', ProviderReadinessState.UNREACHABLE, true, false],
    ['UNKNOWN_ERROR', ProviderReadinessState.UNREACHABLE, true, false],
    ['ERROR', ProviderReadinessState.UNREACHABLE, true, false],
    ['CONNECTED', ProviderReadinessState.CONNECTED, true, true],
  ])('maps %s to %s', (status, state, configured, reachable) => {
    expect(
      providerReadiness({
        status,
        configured: ![
          'NOT_CONFIGURED',
          'BLOCKED_BY_ORG_POLICY',
          'NOT_IMPLEMENTED',
          'NOT_INSTALLED',
        ].includes(status),
        checkedAt: '2026-07-17T00:00:00.000Z',
        message: `${status} message`,
      }),
    ).toEqual(
      expect.objectContaining({
        state,
        configured,
        reachable,
        reasonCode:
          state === ProviderReadinessState.CONNECTED ? 'READ_ONLY_VALIDATION_PASSED' : status,
      }),
    );
  });

  it('keeps connector-not-implemented reason codes when provided', () => {
    expect(
      providerReadiness({
        status: 'NOT_IMPLEMENTED',
        configured: false,
        reasonCode: 'CONNECTOR_NOT_IMPLEMENTED',
        message: 'Connector is not implemented.',
      }),
    ).toEqual(
      expect.objectContaining({
        state: ProviderReadinessState.NOT_CONFIGURED,
        reasonCode: 'CONNECTOR_NOT_IMPLEMENTED',
      }),
    );
  });

  it('never promotes an unknown status to CONNECTED', () => {
    const readiness = providerReadiness({
      status: 'READY',
      configured: true,
      checkedAt: '2026-07-17T00:00:00.000Z',
      message: 'Configuration appears ready.',
    });

    expect(readiness.state).toBe(ProviderReadinessState.UNREACHABLE);
    expect(readiness.reachable).toBe(false);
  });

  it('keeps disabled and not-configured reachable invariants nullable', () => {
    expect(providerReadiness({ status: 'BLOCKED_BY_ORG_POLICY', message: 'Blocked.' })).toEqual(
      expect.objectContaining({
        enabled: false,
        configured: false,
        reachable: null,
        checkedAt: null,
      }),
    );
    expect(providerReadiness({ status: 'NOT_CONFIGURED', message: 'Missing config.' })).toEqual(
      expect.objectContaining({
        enabled: true,
        configured: false,
        reachable: null,
        checkedAt: null,
      }),
    );
  });

  it('sanitizes obvious secret-like message fragments', () => {
    expect(
      providerReadiness({
        status: 'UNREACHABLE',
        configured: true,
        message: 'Failed with token abc123 and password hunter2',
      }).message,
    ).toBe('Failed with token [redacted] and password [redacted]');
  });
});
