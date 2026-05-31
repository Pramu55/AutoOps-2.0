import { env } from '../../config/env.js';
import type { OperationPolicyDecision, OperationPolicyInput, PolicyRisk } from './policy.types.js';

type OpaDataResponse = {
  result?: Partial<OperationPolicyDecision>;
};

const RISKS = new Set<PolicyRisk>(['low', 'medium', 'high', 'critical']);

export class OpaClient {
  async evaluateOperation(input: OperationPolicyInput): Promise<OperationPolicyDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.OPA_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.OPA_URL}${env.OPA_POLICY_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OPA returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as OpaDataResponse;
      return normalizeDecision(data.result);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeDecision(value: Partial<OperationPolicyDecision> | undefined): OperationPolicyDecision {
  return {
    allow: value?.allow === true,
    approvalRequired: value?.approvalRequired === true,
    risk: RISKS.has(value?.risk as PolicyRisk) ? (value?.risk as PolicyRisk) : 'critical',
    reasons: toStringArray(value?.reasons),
    controls: toStringArray(value?.controls),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export const opaClient = new OpaClient();
