const READINESS_STATES = ['DISABLED', 'NOT_CONFIGURED', 'UNREACHABLE', 'CONNECTED'] as const;

type ReadinessState = (typeof READINESS_STATES)[number];

export interface ProviderCardStatus {
  status: string;
  statusDetail?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string | undefined {
  if (isRecord(value) && typeof value[key] === 'string') {
    return value[key];
  }
  return undefined;
}

function readinessState(value: unknown): ReadinessState | undefined {
  const state = getString(value, 'state');
  return READINESS_STATES.includes(state as ReadinessState)
    ? (state as ReadinessState)
    : undefined;
}

function childReadinessState(value: unknown): ReadinessState | undefined {
  if (!isRecord(value)) return undefined;
  return readinessState(value.readiness);
}

function childStatusDetail(children: Array<Record<string, unknown>>): string | undefined {
  const statuses = children
    .map((child) => getString(child, 'status'))
    .filter((status): status is string => Boolean(status));
  return statuses.length > 0 ? Array.from(new Set(statuses)).join(', ') : undefined;
}

function aggregateReadiness(states: ReadinessState[]): string {
  if (states.some((state) => state === 'UNREACHABLE')) return 'UNREACHABLE';
  if (states.length > 0 && states.every((state) => state === 'DISABLED')) return 'DISABLED';
  if (states.some((state) => state === 'NOT_CONFIGURED')) return 'NOT_CONFIGURED';
  if (states.length > 0 && states.every((state) => state === 'CONNECTED')) return 'CONNECTED';
  return 'UNKNOWN';
}

function nestedProviderObjects(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(data.providers)) {
    return data.providers.filter(isRecord);
  }

  return ['prometheus', 'grafana', 'terraform', 'ansible']
    .map((key) => data[key])
    .filter(isRecord);
}

function aggregateProviderStatus(data: Record<string, unknown>): ProviderCardStatus | undefined {
  const children = nestedProviderObjects(data);
  if (children.length === 0) return undefined;

  const states = children.map(childReadinessState);
  if (states.some((state) => !state)) {
    return { status: 'UNKNOWN', statusDetail: childStatusDetail(children) };
  }

  return {
    status: aggregateReadiness(states as ReadinessState[]),
    statusDetail: childStatusDetail(children),
  };
}

export function providerCardStatusFromResponse(response: unknown): ProviderCardStatus {
  if (!isRecord(response)) return { status: 'UNKNOWN' };

  const dataObj = response.data;
  if (isRecord(dataObj)) {
    const dataStatus = getString(dataObj, 'status');
    let status = dataStatus ?? 'UNKNOWN';
    let statusDetail = dataStatus;
    const readiness = readinessState(dataObj.readiness);

    if (readiness) {
      status = readiness;
    } else {
      const aggregate = aggregateProviderStatus(dataObj);
      if (aggregate) {
        status = aggregate.status;
        statusDetail = aggregate.statusDetail ?? statusDetail;
      }
    }

    return { status, statusDetail };
  }

  const resStatus = getString(response, 'status');
  return {
    status: resStatus ?? 'UNKNOWN',
    statusDetail: resStatus,
  };
}
