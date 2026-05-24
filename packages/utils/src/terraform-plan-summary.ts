import { summarizeCommandOutput } from './infrastructure-catalog.js';

export type TerraformPlanCounts = {
  addCount: number;
  changeCount: number;
  destroyCount: number;
};

export type TerraformPlanSafetySummary = TerraformPlanCounts & {
  riskLevel: 'LOW' | 'HIGH';
  applyEligible: boolean;
  blockedReasons: string[];
  safeOutputSummary: string;
};

export function parseTerraformPlanCounts(output: string): TerraformPlanCounts {
  const planMatch = output.match(/Plan:\s*(\d+)\s+to add,\s*(\d+)\s+to change,\s*(\d+)\s+to destroy\./i);
  if (planMatch) {
    return {
      addCount: Number(planMatch[1]),
      changeCount: Number(planMatch[2]),
      destroyCount: Number(planMatch[3]),
    };
  }

  if (/No changes\./i.test(output) || /Your infrastructure matches the configuration/i.test(output)) {
    return { addCount: 0, changeCount: 0, destroyCount: 0 };
  }

  return { addCount: 0, changeCount: 0, destroyCount: 0 };
}

export function summarizeTerraformPlanSafety(output: string): TerraformPlanSafetySummary {
  const counts = parseTerraformPlanCounts(output);
  const blockedReasons: string[] = [];
  if (counts.destroyCount > 0) {
    blockedReasons.push('Terraform plan includes destroy actions. Apply eligibility is blocked.');
  }

  return {
    ...counts,
    riskLevel: counts.destroyCount > 0 ? 'HIGH' : 'LOW',
    applyEligible: counts.destroyCount === 0,
    blockedReasons,
    safeOutputSummary: summarizeCommandOutput(output),
  };
}
