import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type InfrastructureToolName = 'terraform' | 'tofu' | 'ansible-playbook';

export type InfrastructureToolStatus = {
  status: 'CONNECTED' | 'NOT_INSTALLED' | 'NOT_CONFIGURED' | 'UNREACHABLE' | 'ERROR';
  configured: boolean;
  tool: InfrastructureToolName | null;
  version: string | null;
  checkedAt: string;
  message: string;
};

export type TerraformWorkspaceCatalogItem = {
  slug: string;
  displayName: string;
  absolutePath: string;
  relativePath: string;
};

export type AnsiblePlaybookCatalogItem = {
  slug: string;
  displayName: string;
  absolutePath: string;
  relativePath: string;
  inventoryAbsolutePath: string;
  inventoryRelativePath: string;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export function getTerraformRoot(): string {
  return path.resolve(
    process.env.INFRA_TERRAFORM_ROOT?.trim() || path.join(process.cwd(), 'infra', 'terraform'),
  );
}

export function getAnsibleRoot(): string {
  return path.resolve(
    process.env.INFRA_ANSIBLE_ROOT?.trim() || path.join(process.cwd(), 'infra', 'ansible'),
  );
}

export function getInfrastructureTimeoutMs(): number {
  const seconds = Number(process.env.INFRA_OPERATION_TIMEOUT_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 180_000;
}

export function getInfrastructureOutputLimit(): number {
  const value = Number(process.env.INFRA_EXPORT_OUTPUT_LIMIT);
  return Number.isFinite(value) && value > 0 ? value : 8_000;
}

export async function detectTerraformTool(): Promise<InfrastructureToolStatus> {
  const tofu = await detectTool('tofu');
  if (tofu.status === 'CONNECTED') return tofu;
  const terraform = await detectTool('terraform');
  return terraform.status === 'CONNECTED' ? terraform : terraform;
}

export async function detectAnsibleTool(): Promise<InfrastructureToolStatus> {
  return detectTool('ansible-playbook');
}

async function detectTool(tool: InfrastructureToolName): Promise<InfrastructureToolStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const versionArgs = tool === 'ansible-playbook' ? ['--version'] : ['version'];
    const { stdout, stderr } = await execFileAsync(tool, versionArgs, {
      timeout: 10_000,
      windowsHide: true,
    });
    const version = firstLine(stdout || stderr);
    return {
      status: 'CONNECTED',
      configured: true,
      tool,
      version,
      checkedAt,
      message: `${tool} is available.`,
    };
  } catch {
    return {
      status: 'NOT_INSTALLED',
      configured: false,
      tool,
      version: null,
      checkedAt,
      message: `${tool} is not installed in this runtime.`,
    };
  }
}

export async function listTerraformWorkspaces(
  root = getTerraformRoot(),
): Promise<TerraformWorkspaceCatalogItem[]> {
  const resolvedRoot = path.resolve(root);
  if (!existsSync(resolvedRoot)) return [];
  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const items: TerraformWorkspaceCatalogItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || !SLUG_PATTERN.test(entry.name)) continue;
    const workspacePath = path.resolve(resolvedRoot, entry.name);
    if (!isWithin(resolvedRoot, workspacePath)) continue;
    if (!existsSync(path.join(workspacePath, 'main.tf'))) continue;
    items.push({
      slug: entry.name,
      displayName: displayName(entry.name),
      absolutePath: workspacePath,
      relativePath: toSafeRelativePath(workspacePath),
    });
  }

  return items.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getTerraformWorkspaceBySlug(
  slug: string,
  root = getTerraformRoot(),
): Promise<TerraformWorkspaceCatalogItem | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const workspaces = await listTerraformWorkspaces(root);
  return workspaces.find((workspace) => workspace.slug === slug) ?? null;
}

export async function listAnsiblePlaybooks(
  root = getAnsibleRoot(),
): Promise<AnsiblePlaybookCatalogItem[]> {
  const resolvedRoot = path.resolve(root);
  const playbookRoot = path.join(resolvedRoot, 'playbooks');
  const inventoryPath = path.join(resolvedRoot, 'inventory', 'local.ini');
  if (!existsSync(playbookRoot) || !existsSync(inventoryPath)) return [];
  const entries = await readdir(playbookRoot, { withFileTypes: true });
  const items: AnsiblePlaybookCatalogItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const slug = entry.name.replace(/\.ya?ml$/i, '');
    if (!SLUG_PATTERN.test(slug)) continue;
    const playbookPath = path.resolve(playbookRoot, entry.name);
    if (!isWithin(resolvedRoot, playbookPath)) continue;
    const fileStat = await stat(playbookPath);
    if (!fileStat.isFile()) continue;
    items.push({
      slug,
      displayName: displayName(slug),
      absolutePath: playbookPath,
      relativePath: toSafeRelativePath(playbookPath),
      inventoryAbsolutePath: inventoryPath,
      inventoryRelativePath: toSafeRelativePath(inventoryPath),
    });
  }

  return items.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getAnsiblePlaybookBySlug(
  slug: string,
  root = getAnsibleRoot(),
): Promise<AnsiblePlaybookCatalogItem | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const playbooks = await listAnsiblePlaybooks(root);
  return playbooks.find((playbook) => playbook.slug === slug) ?? null;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

export function summarizeCommandOutput(value: string, limit = getInfrastructureOutputLimit()): string {
  const cleaned = stripAnsi(value)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .map((line) =>
      /(token|secret|password|authorization|api[_-]?key|access[_-]?key|private[_-]?key|kubeconfig|credential)/i.test(
        line,
      )
        ? '[REDACTED LINE]'
        : line,
    )
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .slice(0, limit);
  return cleaned || 'Command completed without output.';
}

function firstLine(value: string): string | null {
  return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? null;
}

function displayName(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function toSafeRelativePath(absolutePath: string): string {
  const repoRelative = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
  return repoRelative.startsWith('..') ? path.basename(absolutePath) : repoRelative;
}
