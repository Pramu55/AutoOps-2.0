import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerCardStatusFromResponse } from './integrations-hub-status';

function child(status: string, state: string) {
  return { status, readiness: { state } };
}

test('aggregate provider readiness returns CONNECTED when all children are connected', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        providers: [
          child('CONNECTED', 'CONNECTED'),
          child('CONNECTED', 'CONNECTED'),
        ],
      },
    }).status,
    'CONNECTED',
  );
});

test('aggregate provider readiness returns UNREACHABLE when any child is unreachable', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        prometheus: child('CONNECTED', 'CONNECTED'),
        grafana: child('AUTH_FAILED', 'UNREACHABLE'),
      },
    }).status,
    'UNREACHABLE',
  );
});

test('aggregate provider readiness returns NOT_CONFIGURED for mixed connected and not configured children', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        terraform: child('CONNECTED', 'CONNECTED'),
        ansible: child('NOT_CONFIGURED', 'NOT_CONFIGURED'),
      },
    }).status,
    'NOT_CONFIGURED',
  );
});

test('aggregate provider readiness returns DISABLED when all children are disabled', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        prometheus: child('BLOCKED_BY_ORG_POLICY', 'DISABLED'),
        grafana: child('BLOCKED_BY_ORG_POLICY', 'DISABLED'),
      },
    }).status,
    'DISABLED',
  );
});

test('aggregate provider readiness returns UNKNOWN for valid mixed disabled and connected children', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        prometheus: child('BLOCKED_BY_ORG_POLICY', 'DISABLED'),
        grafana: child('CONNECTED', 'CONNECTED'),
      },
    }).status,
    'UNKNOWN',
  );
});

test('aggregate provider readiness returns UNKNOWN when any child readiness is missing', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        providers: [
          child('CONNECTED', 'CONNECTED'),
          { status: 'CONNECTED' },
        ],
      },
    }).status,
    'UNKNOWN',
  );
});

test('aggregate provider readiness returns UNKNOWN when any child readiness is invalid', () => {
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        providers: [
          child('CONNECTED', 'CONNECTED'),
          { status: 'CONNECTED', readiness: { state: 'SURPRISE' } },
        ],
      },
    }).status,
    'UNKNOWN',
  );
});

test('aggregate provider readiness returns UNKNOWN for empty or malformed aggregate data', () => {
  assert.equal(providerCardStatusFromResponse({ data: {} }).status, 'UNKNOWN');
  assert.equal(
    providerCardStatusFromResponse({
      data: {
        providers: ['not-a-provider'],
      },
    }).status,
    'UNKNOWN',
  );
});

test('ordinary top-level readiness still drives provider card status', () => {
  const result = providerCardStatusFromResponse({
    data: {
      status: 'AUTH_FAILED',
      readiness: { state: 'UNREACHABLE' },
    },
  });

  assert.equal(result.status, 'UNREACHABLE');
  assert.equal(result.statusDetail, 'AUTH_FAILED');
});
