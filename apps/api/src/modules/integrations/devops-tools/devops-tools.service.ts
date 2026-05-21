import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DevOpsToolsStatusResponse, DevOpsToolSummary } from '@autoops/types';
import { DevOpsToolStatus } from '@autoops/types';

const execFileAsync = promisify(execFile);

type ToolDefinition = {
  key: DevOpsToolSummary['key'];
  displayName: string;
  command: string;
  args: string[];
  safeActions: string[];
};

const TOOLS: ToolDefinition[] = [
  { key: 'tofu', displayName: 'OpenTofu', command: 'tofu', args: ['version'], safeActions: ['version', 'validate', 'plan via Infrastructure Center'] },
  { key: 'terraform', displayName: 'Terraform', command: 'terraform', args: ['version'], safeActions: ['version', 'validate', 'plan via Infrastructure Center'] },
  { key: 'ansible', displayName: 'Ansible', command: 'ansible-playbook', args: ['--version'], safeActions: ['syntax-check', 'check mode via Infrastructure Center'] },
  { key: 'kubectl', displayName: 'kubectl', command: 'kubectl', args: ['version', '--client=true'], safeActions: ['read-only readiness detection'] },
  { key: 'helm', displayName: 'Helm', command: 'helm', args: ['version', '--short'], safeActions: ['template validation when allowlisted charts are added'] },
  { key: 'kustomize', displayName: 'Kustomize', command: 'kustomize', args: ['version'], safeActions: ['build validation when allowlisted overlays are added'] },
  { key: 'docker', displayName: 'Docker CLI', command: 'docker', args: ['--version'], safeActions: ['read-only runtime detection'] },
  { key: 'node', displayName: 'Node.js', command: 'node', args: ['--version'], safeActions: ['runtime build checks'] },
  { key: 'pnpm', displayName: 'pnpm', command: 'pnpm', args: ['--version'], safeActions: ['release checks'] },
];

export class DevOpsToolsService {
  async getStatus(): Promise<DevOpsToolsStatusResponse> {
    return {
      tools: await Promise.all(TOOLS.map((tool) => this._detect(tool))),
      generatedAt: new Date().toISOString(),
    };
  }

  private async _detect(tool: ToolDefinition): Promise<DevOpsToolSummary> {
    const checkedAt = new Date().toISOString();
    try {
      const { stdout, stderr } = await execFileAsync(tool.command, tool.args, {
        timeout: 5000,
        windowsHide: true,
      });
      const output = `${stdout}\n${stderr}`.trim().split(/\r?\n/)[0] ?? '';
      return {
        key: tool.key,
        displayName: tool.displayName,
        status: DevOpsToolStatus.CONNECTED,
        version: output || 'installed',
        checkedAt,
        message: `${tool.displayName} is available.`,
        safeActions: tool.safeActions,
      };
    } catch {
      return {
        key: tool.key,
        displayName: tool.displayName,
        status: DevOpsToolStatus.NOT_INSTALLED,
        version: null,
        checkedAt,
        message: `${tool.displayName} is not installed in this runtime.`,
        safeActions: tool.safeActions,
      };
    }
  }
}

export const devOpsToolsService = new DevOpsToolsService();
