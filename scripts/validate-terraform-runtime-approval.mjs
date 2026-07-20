import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const terraformRoot = path.join(repoRoot, 'infra', 'terraform');
const proofRoot = path.join(terraformRoot, 'environments', 'proof');
const errors = [];

const approvalDoc = 'docs/cloud/TERRAFORM_RUNTIME_APPROVAL_PACKAGE.md';
const runtimeScript = 'scripts/run-controlled-terraform-init.ps1';
const exactInitCommand = 'terraform -chdir=infra/terraform/environments/proof init -backend=false';
const approvedLockFiles = [
  'infra/terraform/environments/proof/.terraform.lock.hcl',
  'infra/terraform/environments/production/.terraform.lock.hcl',
];
const approvedProofTerraformDirectory = 'infra/terraform/environments/proof/.terraform';
const expectedResources = [
  'aws_vpc.proof',
  'aws_subnet.public',
  'aws_internet_gateway.proof',
  'aws_route_table.public',
  'aws_route_table_association.public',
  'aws_security_group.proof_instance',
  'aws_iam_role.ssm_instance',
  'aws_iam_role_policy_attachment.ssm_core',
  'aws_iam_instance_profile.ssm',
  'aws_instance.proof',
];

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

function filePath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function relPath(filePathValue) {
  return path.relative(repoRoot, filePathValue).replaceAll('\\', '/');
}

function read(relativePath) {
  return normalizeNewlines(readFileSync(filePath(relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function assertContains(text, pattern, message) {
  assert(pattern.test(text), message);
}

function assertNoPattern(text, pattern, message) {
  assert(!pattern.test(text), message);
}

function existsFile(relativePath) {
  try {
    return statSync(filePath(relativePath)).isFile();
  } catch {
    return false;
  }
}

function listFiles(root) {
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function listDirectories(root) {
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(fullPath, ...listDirectories(fullPath));
    }
  }
  return results;
}

function gitLines(args) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return normalizeNewlines(output)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#') && !line.trimStart().startsWith('//'))
    .join('\n');
}

function activePowerShellLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function hclBlock(text, headerPattern) {
  const match = headerPattern.exec(text);
  if (!match) {
    return '';
  }

  const openIndex = text.indexOf('{', match.index);
  if (openIndex === -1) {
    return '';
  }

  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') {
      depth += 1;
    } else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

function validateSafeText(relativePath, text) {
  const active = stripComments(text);

  assertNoPattern(
    active,
    /\b(access_key|secret_key|session_token|aws_access_key_id|aws_secret_access_key|aws_session_token)\b\s*[:=]/i,
    `${relativePath} must not contain credential assignments`,
  );
  assertNoPattern(active, /\b\d{12}\b/, `${relativePath} must not contain likely AWS account IDs`);
  assertNoPattern(
    active,
    /(^|[^.\w-])(password|token)\s*[:=]\s*["']?[^"'\s#${][^"'\s#]*/i,
    `${relativePath} must not contain plaintext password or token assignments`,
  );
  assertNoPattern(text, /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, `${relativePath} must not contain private keys`);
  assertNoPattern(active, /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i, `${relativePath} must not contain credentialed URLs`);
}

function validateApprovalDoc() {
  assert(existsFile(approvalDoc), `${approvalDoc} must exist`);
  const text = read(approvalDoc);
  const normalized = text.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  validateSafeText(approvalDoc, text);

  const requiredPhrases = [
    'offline only',
    'terraform is not installed',
    'terraform is not run',
    'hashicorp release and registry endpoints are not contacted',
    'aws spend remains usd 0',
    'aws introductory free tier has ended',
    'every future aws resource is billable',
    'c:\\autoops 2.0',
    'feat/terraform-runtime-approval-package',
    '2587c1c64d3aa5f0e935219e16ef18e98b6dc8fb',
    'expected tree hash',
    'clean working tree',
    'protected stashes exactly',
    'official hashicorp release url',
    'expected sha256',
    'actual sha256',
    'gpg verification',
    exactInitCommand,
    'do not chain commands',
    'do not append && terraform plan',
    'do not use -upgrade',
    'do not initialize the production root',
    'terraform plan, apply, destroy, refresh, import, state, console, and test',
    'aws cli commands',
    'sts identity checks',
    'ec2 metadata',
    'docker commands',
    'separate approval gates',
    'aws identity access',
    'input completion',
    'terraform plan',
    'terraform apply',
    'terraform destroy',
    'terraform registry access',
    'must not contact aws apis',
    'expected generated artifacts',
    'stop conditions',
    'evidence requirements',
    'rollback boundary',
  ];

  for (const phrase of requiredPhrases) {
    assert(normalized.includes(phrase), `${approvalDoc} missing required guidance: ${phrase}`);
  }
}

function validateRuntimeScript() {
  assert(existsFile(runtimeScript), `${runtimeScript} must exist`);
  const text = read(runtimeScript);
  validateSafeText(runtimeScript, text);

  assertContains(text, /param\s*\(/, `${runtimeScript} must define a parameter block`);
  for (const parameter of [
    'ExpectedBranch',
    'ExpectedCommit',
    'ExpectedTree',
    'TerraformPath',
    'ExpectedTerraformVersion',
    'ApprovalReference',
    'ApproveTerraformInit',
  ]) {
    assertContains(text, new RegExp(`\\$${parameter}\\b`), `${runtimeScript} must require ${parameter}`);
  }

  const requiredChecks = [
    /branch['"],\s*['"]--show-current/,
    /rev-parse['"],\s*['"]HEAD/,
    /rev-parse['"],\s*['"]HEAD\^\{tree\}/,
    /status['"],\s*['"]--porcelain=v1/,
    /stash['"],\s*['"]list/,
    /Get-FileHash[\s\S]*SHA256/,
    /ls-files[\s\S]*\.terraform\.lock\.hcl/,
    /diff[\s\S]*--cached[\s\S]*\.terraform\.lock\.hcl/,
    /validate-terraform-foundation\.mjs/,
    /validate-aws-proof-infrastructure\.mjs/,
    /validate-terraform-init-readiness\.mjs/,
    /validate-terraform-runtime-approval\.mjs/,
    /scan-secrets\.ps1/,
    /AllowProofTerraformDirectory/,
    /Stop before plan/,
  ];

  for (const pattern of requiredChecks) {
    assertContains(text, pattern, `${runtimeScript} is missing required fail-closed check ${pattern}`);
  }

  assertNoPattern(text, /\(Invoke-Git[\s\S]*?\)\s*\[0\]/, `${runtimeScript} must not index Invoke-Git scalar output directly`);
  assertContains(text, /function\s+Get-ExactlyOneGitLine\b/, `${runtimeScript} must use explicit one-line Git result validation`);
  assertContains(text, /\$lines\s*=\s*@\(Invoke-Git\s+\$Arguments\)/, `${runtimeScript} must force Invoke-Git output into an array`);
  assertContains(text, /\$lines\.Count\s+-ne\s+1/, `${runtimeScript} must fail unless Git returns exactly one line`);
  assertContains(text, /\(\[string\]\$lines\[0\]\)\.Trim\(\)/, `${runtimeScript} must trim the single Git result after cardinality validation`);
  assertContains(text, /IsNullOrWhiteSpace\(\$value\)/, `${runtimeScript} must reject blank Git scalar values`);
  assertContains(text, /\$branch\s*=\s*Get-ExactlyOneGitLine\s+@\('branch',\s*'--show-current'\)\s+'current branch'/, `${runtimeScript} must use safe branch capture`);
  assertContains(text, /\$commit\s*=\s*Get-ExactlyOneGitLine\s+@\('rev-parse',\s*'HEAD'\)\s+'HEAD commit'/, `${runtimeScript} must use safe commit capture`);
  assertContains(text, /\$tree\s*=\s*Get-ExactlyOneGitLine\s+@\('rev-parse',\s*'HEAD\^\{tree\}'\)\s+'HEAD tree'/, `${runtimeScript} must use safe tree capture`);
  assertNoPattern(text, /\[System\.IO\.Path\]::GetRelativePath/, `${runtimeScript} must remain compatible with Windows PowerShell 5.1`);
  assertContains(text, /\[System\.IO\.Path\]::GetFullPath\(\$repoRoot\)/, `${runtimeScript} must normalize the repository root`);
  assertContains(text, /\[System\.IO\.Path\]::GetFullPath\(\$PathValue\)/, `${runtimeScript} must normalize generated artifact paths`);
  assertContains(text, /StartsWith\([\s\S]*?\$rootPrefix[\s\S]*?\[System\.StringComparison\]::OrdinalIgnoreCase/, `${runtimeScript} must reject paths outside the repository root`);
  assertContains(text, /Substring\(\$rootPrefix\.Length\)/, `${runtimeScript} must derive relative paths without Path.GetRelativePath`);

  assert(text.includes(exactInitCommand), `${runtimeScript} must print the exact approved init command`);
  assertContains(text, /\$initArgs\s*=\s*@\("-chdir=\$proofRootRelative",\s*'init',\s*'-backend=false'\)/, `${runtimeScript} must construct only the approved init arguments`);
  assertContains(text, /&\s+\$resolvedTerraform\s+@initArgs/, `${runtimeScript} must execute Terraform only through the approved init argument list`);
  assertContains(text, /&\s+\$resolvedTerraform\s+version/, `${runtimeScript} must run only a Terraform version check before init`);
  assertContains(
    text,
    /Invoke-CheckedCommand\s+'node'\s+@\(\s*'scripts\/validate-terraform-foundation\.mjs',\s*'--allow-proof-terraform-directory'\s*\)/,
    `${runtimeScript} must pass the exact proof .terraform opt-in flag only to the post-init foundation validator`,
  );
  assertContains(
    text,
    /Invoke-CheckedCommand\s+'node'\s+@\(\s*'scripts\/validate-terraform-init-readiness\.mjs',\s*'--allow-proof-terraform-directory'\s*\)/,
    `${runtimeScript} must pass the exact proof .terraform opt-in flag only to the post-init readiness validator`,
  );
  assertNoPattern(text, /allow-proof-terraform-directory[\s\S]{0,120}(Environment|env:|SetEnvironmentVariable)/i, `${runtimeScript} must not use an environment-based .terraform bypass`);
  const initArgsLine = text.match(/\$initArgs\s*=\s*@\([^\n]+\)/)?.[0] ?? '';
  assertNoPattern(initArgsLine, /-upgrade/, `${runtimeScript} must not include -upgrade in init arguments`);

  const activeLines = activePowerShellLines(text).join('\n');
  const terraformExecLines = activePowerShellLines(text)
    .filter((line) => /&\s+\$resolvedTerraform\b/.test(line))
    .join('\n');
  assertNoPattern(activeLines, /(^|\s)(aws|aws\.exe)\s+/i, `${runtimeScript} must not execute AWS CLI`);
  assertNoPattern(activeLines, /(^|\s)(docker|docker\.exe)\s+/i, `${runtimeScript} must not execute Docker`);
  assertNoPattern(terraformExecLines, /\b(plan|apply|destroy|refresh|import|state|console|test|providers|validate)\b/i, `${runtimeScript} must not execute prohibited Terraform operations`);
  assertNoPattern(activeLines, /(^|\s)(Remove-Item|rm|rmdir|del)(\s|$)/i, `${runtimeScript} must not delete generated artifacts`);
  assertNoPattern(activeLines, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_PROFILE/i, `${runtimeScript} must not inspect credential environment variables`);
}

function validatePackageScript() {
  const pkg = JSON.parse(read('package.json'));
  assert(
    pkg.scripts?.['check:terraform-runtime-approval'] === 'node scripts/validate-terraform-runtime-approval.mjs',
    'package.json must expose check:terraform-runtime-approval',
  );
}

function validateReadme() {
  const text = read('infra/terraform/README.md');
  const normalized = text.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  validateSafeText('infra/terraform/README.md', text);

  const requiredPhrases = [
    'gate 3 slice 5c terraform runtime approval package',
    'documentation and static-script preparation only',
    'terraform was not installed or executed in slice 5c',
    'hashicorp release servers were not contacted',
    'terraform registry was not contacted',
    'the approved lock files were not modified',
    'aws was not accessed',
    'no resources were created',
    'aws spend remains usd 0',
    'docs/cloud/terraform_runtime_approval_package.md',
    'scripts/run-controlled-terraform-init.ps1',
    'pnpm.cmd run check:terraform-runtime-approval',
  ];

  for (const phrase of requiredPhrases) {
    assert(normalized.includes(phrase), `infra/terraform/README.md missing Slice 5C guidance: ${phrase}`);
  }
}

function validateGeneratedArtifacts() {
  const allowedLocks = new Set(approvedLockFiles);
  const filesystemLocks = listFiles(repoRoot)
    .map((file) => relPath(file))
    .filter((relativePath) => path.basename(relativePath) === '.terraform.lock.hcl')
    .sort();
  const trackedFiles = new Set(gitLines(['ls-files']));
  const modifiedFiles = new Set(gitLines(['diff', '--name-only']));
  const stagedFiles = new Set(gitLines(['diff', '--cached', '--name-only']));

  assert(
    JSON.stringify(filesystemLocks) === JSON.stringify([...approvedLockFiles].sort()),
    `Terraform lock files must be exactly: ${approvedLockFiles.join(', ')}`,
  );

  for (const lockFile of approvedLockFiles) {
    assert(trackedFiles.has(lockFile), `Approved lock file must be tracked: ${lockFile}`);
    assert(!modifiedFiles.has(lockFile), `Approved lock file must not differ from HEAD: ${lockFile}`);
    assert(!stagedFiles.has(lockFile), `Approved lock file must not be staged: ${lockFile}`);
    assert(allowedLocks.has(lockFile), `Approved lock file set mismatch: ${lockFile}`);
  }

  for (const dir of listDirectories(terraformRoot)) {
    const relativePath = relPath(dir);
    const name = path.basename(dir);
    assert(
      name !== '.terraform' || relativePath === approvedProofTerraformDirectory,
      `Unexpected .terraform directory: ${relativePath}`,
    );
    assert(name !== '.terraform.d', `Unexpected Terraform CLI config/cache directory: ${relPath(dir)}`);
    assert(name !== 'terraform-plugin-cache', `Unexpected Terraform plugin cache directory: ${relPath(dir)}`);
  }

  for (const file of listFiles(terraformRoot)) {
    const relativePath = relPath(file);
    const name = path.basename(file);

    assert(!/^terraform\.tfstate(\.backup)?$/.test(name) && !name.includes('.tfstate.'), `Unexpected Terraform state file: ${relativePath}`);
    assert(!/\.(tfplan|plan)$/.test(name), `Unexpected Terraform plan artifact: ${relativePath}`);
    assert(!/^crash(\..*)?\.log$/.test(name), `Unexpected Terraform crash log: ${relativePath}`);
    assert(!/^(override|.*_override)\.tf(\.json)?$/.test(name), `Unexpected Terraform override file: ${relativePath}`);
  }
}

function validateTerraformScope() {
  const tfText = listFiles(proofRoot)
    .filter((file) => file.endsWith('.tf'))
    .map((file) => readFileSync(file, 'utf8'))
    .map(normalizeNewlines)
    .join('\n');
  const active = stripComments(tfText);

  assertNoPattern(active, /^\s*data\s+"/m, 'Proof Terraform must not contain data sources');
  assertNoPattern(active, /^\s*backend\s+"/m, 'Proof Terraform must not configure a backend');
  assertNoPattern(active, /^\s*(module|import|moved|provisioner)\s+"/m, 'Proof Terraform must not contain module, import, moved, or provisioner blocks');

  const resources = [...active.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)]
    .map((match) => `${match[1]}.${match[2]}`)
    .sort();
  assert(
    JSON.stringify(resources) === JSON.stringify([...expectedResources].sort()),
    `Proof Terraform resources must be exactly: ${expectedResources.join(', ')}`,
  );

  const outputs = read('infra/terraform/environments/proof/outputs.tf');
  const outputNames = [...outputs.matchAll(/^\s*output\s+"([^"]+)"\s*{/gm)].map((match) => match[1]).sort();
  const approvedOutputs = [
    'estimated_hourly_cost_usd',
    'instance_id',
    'proof_expires_at',
    'public_ipv4',
    'public_url',
    'security_group_id',
    'ssm_target_id',
  ].sort();
  assert(JSON.stringify(outputNames) === JSON.stringify(approvedOutputs), 'Proof outputs must stay within the approved safe-output set');

  for (const output of outputNames) {
    const block = hclBlock(outputs, new RegExp(`output\\s+"${output}"\\s*{`, 'm'));
    assert(/sensitive\s*=\s*false/.test(block), `Output ${output} must be sensitive = false`);
  }
}

validateApprovalDoc();
validateRuntimeScript();
validatePackageScript();
validateReadme();
validateGeneratedArtifacts();
validateTerraformScope();

if (errors.length > 0) {
  console.error('Terraform runtime approval validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Terraform runtime approval validation passed.');
