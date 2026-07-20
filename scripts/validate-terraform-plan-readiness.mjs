import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const terraformRoot = path.join(repoRoot, 'infra', 'terraform');
const proofRoot = path.join(terraformRoot, 'environments', 'proof');
const errors = [];

const docPath = 'docs/cloud/TERRAFORM_PLAN_READINESS_PACKAGE.md';
const wrapperPath = 'scripts/run-controlled-terraform-plan.ps1';
const expectedScript = 'node scripts/validate-terraform-plan-readiness.mjs';
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
const approvedOutputs = [
  'estimated_hourly_cost_usd',
  'instance_id',
  'proof_expires_at',
  'public_ipv4',
  'public_url',
  'security_group_id',
  'ssm_target_id',
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
  return normalizeNewlines(output).split('\n').map((line) => line.trim()).filter(Boolean);
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

function validateSafeText(relativePath, text) {
  const active = stripComments(text);
  assertNoPattern(active, /\b(access_key|secret_key|session_token|aws_access_key_id|aws_secret_access_key|aws_session_token)\b\s*[:=]/i, `${relativePath} must not contain credential assignments`);
  assertNoPattern(active, /\b\d{12}\b/, `${relativePath} must not contain likely account IDs`);
  assertNoPattern(active, /(^|[^.\w-])(password|token)\s*[:=]\s*["']?[^"'\s#${][^"'\s#]*/i, `${relativePath} must not contain plaintext password or token assignments`);
  assertNoPattern(text, /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, `${relativePath} must not contain private keys`);
}

function validateDocument() {
  assert(existsFile(docPath), `${docPath} must exist`);
  const text = read(docPath);
  const normalized = text.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  validateSafeText(docPath, text);

  for (const phrase of [
    'offline preparation only',
    'terraform is not executed',
    'credentials and profiles are not accessed',
    'account identity and sts calls are not made',
    'aws apis are not called',
    'no plan or state exists',
    'aws spend remains usd 0',
    'exact branch, commit sha, and tree sha',
    'approved terraform binary absolute path',
    'binary checksum evidence',
    'exact ignored local tfvars absolute path',
    'exact ignored output plan absolute path',
    'aws_region = ap-south-1',
    'ubuntu server 24.04 lts x86_64 ami id',
    'tester ipv4 /32',
    'rfc3339 utc expiry timestamp',
    'no more than eight hours',
    'instance_type = t3.large',
    'root_volume_size_gib = 40',
    'expected_max_cost_usd <= 2',
    'detailed_monitoring = false',
    'enable_ssm = true',
    'associate_public_ip = true',
    'enable_public_https = true',
    'disposable data classification',
    'exact ten-resource allowlist',
    'separate approval for aws identity and credential access',
    'separate approval for plan execution',
    'separate approval after plan review for apply',
    'terraform -chdir=infra/terraform/environments/proof plan -refresh=false -input=false -lock=false -var-file=<approved-local-tfvars> -out=<approved-local-plan>',
    '-refresh=false does not guarantee zero provider or aws interaction',
    'plan execution may still require approved credentials',
    'apply remains prohibited',
    'exactly ten creates and zero changes or destroys',
    'cost must be revalidated immediately before plan and apply',
    'rollback does not mean casually deleting state',
  ]) {
    assert(normalized.includes(phrase), `${docPath} missing required phrase: ${phrase}`);
  }
  assert(!normalized.includes('cost is not revalidated immediately before plan and apply'), `${docPath} must not contain the inverted cost revalidation phrase`);
}

function validateWrapper() {
  assert(existsFile(wrapperPath), `${wrapperPath} must exist`);
  const text = read(wrapperPath);
  validateSafeText(wrapperPath, text);

  for (const parameter of [
    'ExpectedBranch',
    'ExpectedCommit',
    'ExpectedTree',
    'TerraformPath',
    'ExpectedTerraformVersion',
    'ExpectedTerraformSha256',
    'ApprovalReference',
    'ApprovedTfvarsPath',
    'ApprovedPlanPath',
    'ApprovedAwsRegion',
    'ApprovedAmiId',
    'ApprovedIngressCidr',
    'ApprovedDomain',
    'ApprovedExpiryUtc',
    'ApprovedCostReference',
    'ApprovedMaxCostUsd',
    'ApproveCredentialUse',
    'ApproveTerraformPlan',
  ]) {
    assertContains(text, new RegExp(`\\$${parameter}\\b`), `${wrapperPath} must require ${parameter}`);
  }

  assertContains(text, /\$expectedRepoRoot\s*=\s*'C:\\AutoOps 2\.0'/, `${wrapperPath} must check exact repository root`);
  assertContains(text, /function\s+Get-ExactlyOneGitLine\b/, `${wrapperPath} must use safe one-line Git helper`);
  assertContains(text, /branch',\s*'--show-current'/, `${wrapperPath} must check branch`);
  assertContains(text, /rev-parse',\s*'HEAD'/, `${wrapperPath} must check commit`);
  assertContains(text, /rev-parse',\s*'HEAD\^\{tree\}'/, `${wrapperPath} must check tree`);
  assertContains(text, /origin\/\$ExpectedBranch/, `${wrapperPath} must verify origin synchronization`);
  assertContains(text, /status',\s*'--porcelain=v1'/, `${wrapperPath} must verify clean Git status`);
  assertContains(text, /git[\s\S]*check-ignore/, `${wrapperPath} must verify ignored tfvars and plan paths`);
  assertContains(text, /approved paths must remain under proof root/, `${wrapperPath} must restrict paths to proof root`);
  assertContains(text, /proof \.terraform directory must exist before plan/, `${wrapperPath} must require proof .terraform before plan`);
  assertContains(text, /\[System\.IO\.Path\]::IsPathRooted\(\$ApprovedTfvarsPath\)[\s\S]*\$tfvarsFullPath\s*=\s*\[System\.IO\.Path\]::GetFullPath\(\$ApprovedTfvarsPath\)/, `${wrapperPath} must check the original tfvars path is rooted before GetFullPath`);
  assertContains(text, /\[System\.IO\.Path\]::IsPathRooted\(\$ApprovedPlanPath\)[\s\S]*\$planFullPath\s*=\s*\[System\.IO\.Path\]::GetFullPath\(\$ApprovedPlanPath\)/, `${wrapperPath} must check the original plan path is rooted before GetFullPath`);
  assertContains(text, /function\s+Get-ProofRelativePath\b[\s\S]*StartsWith\(\$proofRootPrefix,\s*\[System\.StringComparison\]::OrdinalIgnoreCase\)[\s\S]*Substring\(\$proofRootPrefix\.Length\)[\s\S]*Replace\('\\',\s*'\/'\)[\s\S]*must not be empty/, `${wrapperPath} must derive proof-root-relative paths without Path.GetRelativePath`);
  assertContains(text, /\$tfvarsRelative\s*=\s*Get-RelativePath\s+\$tfvarsFullPath[\s\S]*\$planRelative\s*=\s*Get-RelativePath\s+\$planFullPath[\s\S]*\$tfvarsProofRelative\s*=\s*Get-ProofRelativePath\s+\$tfvarsFullPath[\s\S]*\$planProofRelative\s*=\s*Get-ProofRelativePath\s+\$planFullPath/, `${wrapperPath} must keep repository-relative and proof-relative path representations separate`);
  assertContains(text, /Test-Path\s+-LiteralPath\s+\$TerraformPath[\s\S]*Resolve-Path\s+-LiteralPath\s+\$TerraformPath/, `${wrapperPath} must test TerraformPath before Resolve-Path`);
  assertContains(text, /\$ExpectedTerraformSha256\s+-notmatch\s+'\^\[A-Fa-f0-9\]\{64\}\$'/, `${wrapperPath} must validate ExpectedTerraformSha256 as 64 hex characters`);
  assertContains(text, /Get-FileHash\s+-LiteralPath\s+\$TerraformPath\s+-Algorithm\s+SHA256/, `${wrapperPath} must calculate Terraform binary SHA256`);
  assertContains(text, /\$actualTerraformSha256\s+-ine\s+\$ExpectedTerraformSha256[\s\S]*&\s+\$resolvedTerraform\s+version/, `${wrapperPath} must compare SHA256 before Terraform version execution`);

  assertContains(
    text,
    /\$planArgs\s*=\s*@\(\s*"-chdir=infra\/terraform\/environments\/proof",\s*"plan",\s*"-refresh=false",\s*"-input=false",\s*"-lock=false",\s*"-var-file=\$tfvarsProofRelative",\s*"-out=\$planProofRelative"\s*\)/,
    `${wrapperPath} must construct the exact plan argument list`,
  );
  assertContains(text, /&\s+\$resolvedTerraform\s+@planArgs/, `${wrapperPath} must invoke Terraform only with the exact plan args`);
  assertContains(text, /Stop before apply/, `${wrapperPath} must stop before apply`);
  assertContains(text, /Test-Path[\s\S]*\$planFullPath[\s\S]*PathType Leaf/, `${wrapperPath} must verify plan file exists after plan`);
  assertContains(text, /Assert-CleanGitState[\s\S]*Assert-ApprovedLockState[\s\S]*Assert-GeneratedArtifacts/, `${wrapperPath} must verify post-plan state`);

  const activeLines = activePowerShellLines(text).join('\n');
  const terraformExecLines = activePowerShellLines(text)
    .filter((line) => /&\s+\$resolvedTerraform\b/.test(line))
    .join('\n');
  assertNoPattern(terraformExecLines, /\b(apply|destroy|refresh|import|state|console|test|providers|validate|init|force-unlock|taint|untaint|graph|output|show|workspace)\b/i, `${wrapperPath} must not execute prohibited Terraform commands`);
  assertNoPattern(activeLines, /(^|\s)(aws|aws\.exe)\s+/i, `${wrapperPath} must not execute AWS CLI`);
  assertNoPattern(activeLines, /(^|\s)(docker|docker\.exe)\s+/i, `${wrapperPath} must not execute Docker`);
  assertNoPattern(activeLines, /(^|\s)(Remove-Item|rm|rmdir|del)(\s|$)/i, `${wrapperPath} must not delete artifacts`);
  assertNoPattern(activeLines, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_PROFILE|Get-ChildItem\s+Env:|Get-Content[\s\S]*credentials/i, `${wrapperPath} must not inspect credential environment or profile files`);
  const planArgsBlock = text.match(/\$planArgs\s*=\s*@\([\s\S]*?\n\)/)?.[0] ?? '';
  assertNoPattern(planArgsBlock, /\$tfvarsRelative|\$planRelative/, `${wrapperPath} must not pass repository-relative paths to Terraform plan`);
  assertContains(planArgsBlock, /\$tfvarsProofRelative[\s\S]*\$planProofRelative/, `${wrapperPath} must pass proof-root-relative paths to Terraform plan`);
  assertNoPattern(planArgsBlock, /-upgrade|-target|-replace|-refresh-only|-destroy|-generate-config-out|-reconfigure|-migrate-state|-backend-config/i, `${wrapperPath} must not include unsafe flags in the approved plan argument array`);
  assertContains(text, /\$forbiddenArgs\s*=\s*@\([\s\S]*'-upgrade'[\s\S]*'-target'[\s\S]*'-replace'[\s\S]*'-refresh-only'[\s\S]*'-destroy'[\s\S]*'-generate-config-out'[\s\S]*'-reconfigure'[\s\S]*'-migrate-state'/, `${wrapperPath} must explicitly prohibit unsafe Terraform flags`);
}

function validatePackageAndReadme() {
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts?.['check:terraform-plan-readiness'] === expectedScript, `package.json must define check:terraform-plan-readiness as ${expectedScript}`);

  const readme = read('infra/terraform/README.md');
  const normalized = readme.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  validateSafeText('infra/terraform/README.md', readme);
  for (const phrase of [
    'gate 3 slice 5e terraform plan readiness',
    'offline preparation only',
    'wrapper and validator are prepared',
    'terraform was not executed',
    'plan was not executed',
    'credentials were not accessed',
    'sts was not called',
    'aws api was not accessed',
    'no state or plan exists',
    'no resources were created',
    'aws spend remains usd 0',
    'pnpm.cmd run check:terraform-plan-readiness',
  ]) {
    assert(normalized.includes(phrase), `README missing Slice 5E phrase: ${phrase}`);
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

  const resources = [...active.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)].map((match) => `${match[1]}.${match[2]}`).sort();
  assert(JSON.stringify(resources) === JSON.stringify([...expectedResources].sort()), `Proof resources must be exactly: ${expectedResources.join(', ')}`);

  assertContains(active, /default\s*=\s*"ap-south-1"[\s\S]*condition\s*=\s*var\.aws_region\s*==\s*"ap-south-1"/, 'Region guardrail must remain ap-south-1');
  assertContains(active, /default\s*=\s*"t3\.large"[\s\S]*condition\s*=\s*var\.instance_type\s*==\s*"t3\.large"/, 'Instance type guardrail must remain t3.large');
  assertContains(active, /root_volume_size_gib[\s\S]*default\s*=\s*40[\s\S]*condition\s*=\s*var\.root_volume_size_gib\s*==\s*40/, 'Root volume guardrail must remain 40');
  assertContains(active, /expected_max_cost_usd[\s\S]*condition\s*=\s*var\.expected_max_cost_usd\s*<=\s*2/, 'Cost guardrail must remain <= 2');

  const outputs = read('infra/terraform/environments/proof/outputs.tf');
  const outputNames = [...outputs.matchAll(/^\s*output\s+"([^"]+)"\s*{/gm)].map((match) => match[1]).sort();
  assert(JSON.stringify(outputNames) === JSON.stringify([...approvedOutputs].sort()), 'Proof outputs must remain approved output set');
}

function validateGeneratedArtifactsAndIgnores() {
  const gitignore = read('.gitignore').split('\n');
  for (const rule of ['*.tfstate', '*.tfstate.*', '*.tfplan', '*.tfplan.*', '*.plan', '*.tfvars', '*.tfvars.json']) {
    assert(gitignore.includes(rule), `.gitignore must include ${rule}`);
  }

  for (const dir of listDirectories(terraformRoot)) {
    const name = path.basename(dir);
    assert(name !== '.terraform', `Unexpected .terraform directory: ${relPath(dir)}`);
    assert(name !== '.terraform.d', `Unexpected .terraform.d directory: ${relPath(dir)}`);
    assert(name !== 'terraform-plugin-cache', `Unexpected provider cache directory: ${relPath(dir)}`);
  }
  for (const file of listFiles(terraformRoot)) {
    const relativePath = relPath(file);
    const name = path.basename(file);
    assert(!/^terraform\.tfstate(\.backup)?$/.test(name) && !name.includes('.tfstate.'), `Unexpected state file: ${relativePath}`);
    assert(!/\.(tfplan|plan)$/.test(name), `Unexpected plan file: ${relativePath}`);
    assert(!/^crash(\..*)?\.log$/.test(name), `Unexpected crash log: ${relativePath}`);
    assert(!(name.endsWith('.tfvars') || name.endsWith('.tfvars.json')), `Unexpected real tfvars file: ${relativePath}`);
  }
}

validateDocument();
validateWrapper();
validatePackageAndReadme();
validateTerraformScope();
validateGeneratedArtifactsAndIgnores();

if (errors.length > 0) {
  console.error('Terraform plan readiness validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Terraform plan readiness validation passed.');
