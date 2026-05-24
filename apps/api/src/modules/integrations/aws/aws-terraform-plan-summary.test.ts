import { describe, expect, it } from 'vitest';
import { summarizeTerraformPlanSafety } from '@autoops/utils';

describe('summarizeTerraformPlanSafety', () => {
  it('redacts secret-like output and summarizes add/change/destroy counts', () => {
    const summary = summarizeTerraformPlanSafety([
      'Plan: 2 to add, 1 to change, 0 to destroy.',
      'secret material: should-not-leak',
    ].join('\n'));

    expect(summary.addCount).toBe(2);
    expect(summary.changeCount).toBe(1);
    expect(summary.destroyCount).toBe(0);
    expect(summary.riskLevel).toBe('LOW');
    expect(summary.applyEligible).toBe(true);
    expect(summary.safeOutputSummary).toContain('[REDACTED LINE]');
    expect(summary.safeOutputSummary).not.toContain('should-not-leak');
  });

  it('marks destroy plans high risk and blocks apply eligibility', () => {
    const summary = summarizeTerraformPlanSafety('Plan: 0 to add, 1 to change, 1 to destroy.');

    expect(summary.destroyCount).toBe(1);
    expect(summary.riskLevel).toBe('HIGH');
    expect(summary.applyEligible).toBe(false);
    expect(summary.blockedReasons.join(' ')).toContain('destroy');
  });
});
