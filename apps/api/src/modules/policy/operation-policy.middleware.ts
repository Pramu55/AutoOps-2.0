import { env } from '../../config/env.js';
import { opaClient, type OpaClient } from './opa.client.js';
import type {
  EvaluatedOperationPolicy,
  OperationPolicyDecision,
  OperationPolicyInput,
} from './policy.types.js';

const SHADOW_ALLOW: OperationPolicyDecision = {
  allow: true,
  approvalRequired: false,
  risk: 'low',
  reasons: ['OPA decision observed in shadow mode.'],
  controls: ['shadow_mode_observation'],
};

const FAIL_CLOSED: OperationPolicyDecision = {
  allow: false,
  approvalRequired: false,
  risk: 'critical',
  reasons: ['OPA policy evaluation was unavailable.'],
  controls: ['fail_closed'],
};

export async function evaluateOperationPolicy(
  input: OperationPolicyInput,
  client: OpaClient = opaClient,
): Promise<EvaluatedOperationPolicy> {
  let decision: OperationPolicyDecision;

  try {
    decision = await client.evaluateOperation(input);
  } catch {
    decision = FAIL_CLOSED;
  }

  const enforcedDecision =
    decision.controls.includes('fail_closed') || env.OPA_ENFORCEMENT_MODE === 'enforce'
      ? decision
      : SHADOW_ALLOW;

  return {
    mode: env.OPA_ENFORCEMENT_MODE,
    input,
    decision,
    enforcedDecision,
  };
}
