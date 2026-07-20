import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const terraformRoot = path.join(repoRoot, 'infra', 'terraform');
const proofRoot = path.join(terraformRoot, 'environments', 'proof');
const errors = [];
const approvedLockFiles = [
  'infra/terraform/environments/production/.terraform.lock.hcl',
  'infra/terraform/environments/proof/.terraform.lock.hcl',
];
const allowProofTerraformDirectoryFlag = '--allow-proof-terraform-directory';
const suppliedArguments = process.argv.slice(2);
const unexpectedArguments = suppliedArguments.filter(
  (argument) => argument !== allowProofTerraformDirectoryFlag,
);
const allowProofTerraformDirectory = suppliedArguments.includes(allowProofTerraformDirectoryFlag);
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

const requiredTfvarsKeys = [
  'project_name',
  'environment',
  'aws_region',
  'owner',
  'cost_center',
  'managed_by',
  'data_classification',
  'proof_expires_at',
  'approved_domain',
  'approved_ingress_cidr',
  'ami_id',
  'cost_approval_reference',
  'max_proof_hours',
  'instance_type',
  'root_volume_size_gib',
  'enable_public_https',
  'associate_public_ip',
  'enable_ssm',
  'detailed_monitoring',
  'expected_max_cost_usd',
];

const requiredGitignoreRules = [
  '.terraform/',
  '**/.terraform/',
  '**/.terraform/*',
  '*.tfstate',
  '*.tfstate.*',
  '*.tfplan',
  '*.tfplan.*',
  '*.plan',
  '*.tfvars',
  '*.tfvars.json',
  '!*.tfvars.example',
  'override.tf',
  'override.tf.json',
  '*_override.tf',
  '*_override.tf.json',
  '.terraformrc',
  'terraform.rc',
  '.terraform.d/',
  '**/.terraform.d/',
  'terraform-plugin-cache/',
  '**/terraform-plugin-cache/',
  'crash.log',
  'crash.*.log',
];

function filePath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function relPath(filePathValue) {
  return path.relative(repoRoot, filePathValue).replaceAll('\\', '/');
}

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

function read(relativePath) {
  return normalizeNewlines(readFileSync(filePath(relativePath), 'utf8'));
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

function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#') && !line.trimStart().startsWith('//'))
    .join('\n');
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
    /\b(access_key|secret_key|session_token|aws_access_key_id|aws_secret_access_key|aws_session_token|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|profile|shared_credentials_file|credential_path)\b\s*[:=]/i,
    `${relativePath} must not contain credential fields`,
  );
  assertNoPattern(active, /\b\d{12}\b/, `${relativePath} must not contain likely AWS account IDs`);
  assertNoPattern(
    active,
    /(^|[^.\w-])(password|token)\s*[:=]\s*["']?[^"'\s#${][^"'\s#]*/i,
    `${relativePath} must not contain plaintext password or token assignments`,
  );
  assertNoPattern(text, /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, `${relativePath} must not contain private keys`);
  assertNoPattern(text, /-----BEGIN CERTIFICATE-----/i, `${relativePath} must not contain certificate material`);
  assertNoPattern(active, /\bAKIA[0-9A-Z]{16}\b|\bASIA[0-9A-Z]{16}\b/, `${relativePath} must not contain AWS access keys`);
  assertNoPattern(active, /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i, `${relativePath} must not contain credentialed URLs`);
}

function parseTfvarsKeys(text) {
  return [...stripComments(text).matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((match) => match[1]);
}

function validateTfvarsExample() {
  const relativePath = 'infra/terraform/environments/proof/terraform.tfvars.example';
  assert(existsSync(filePath(relativePath)), `${relativePath} must exist`);

  const text = read(relativePath);
  validateSafeText(relativePath, text);
  const keys = parseTfvarsKeys(text);
  const missing = requiredTfvarsKeys.filter((key) => !keys.includes(key));
  const unexpected = keys.filter((key) => !requiredTfvarsKeys.includes(key));

  assert(missing.length === 0, `${relativePath} is missing keys: ${missing.join(', ')}`);
  assert(unexpected.length === 0, `${relativePath} contains unexpected keys: ${unexpected.join(', ')}`);
  assert(text.includes('documentation-only'), `${relativePath} must state it is documentation-only`);
  assert(text.includes('not directly usable for apply'), `${relativePath} must state it is not directly usable for apply`);

  for (const key of ['proof_expires_at', 'approved_domain', 'approved_ingress_cidr', 'ami_id', 'cost_approval_reference']) {
    assertContains(
      text,
      new RegExp(`${key}\\s*=\\s*"[^"]*replace-with`, 'i'),
      `${relativePath} must use a replace-with placeholder for ${key}`,
    );
  }
}

function validateGitignore() {
  const relativePath = '.gitignore';
  const rules = read(relativePath).split('\n');

  for (const rule of requiredGitignoreRules) {
    assert(rules.includes(rule), `${relativePath} must include ${rule}`);
  }
}

function validateGeneratedArtifacts() {
  const allowedLockFiles = new Set(approvedLockFiles);
  const trackedFiles = new Set(gitLines(['ls-files']));
  const modifiedFiles = new Set(gitLines(['diff', '--name-only']));
  const stagedFiles = new Set(gitLines(['diff', '--cached', '--name-only']));
  const filesystemLockFiles = listFiles(repoRoot)
    .map((file) => relPath(file))
    .filter((relativePath) => path.basename(relativePath) === '.terraform.lock.hcl')
    .sort();
  const trackedLockFiles = [...trackedFiles]
    .filter((relativePath) => path.basename(relativePath) === '.terraform.lock.hcl')
    .sort();

  for (const dir of listDirectories(terraformRoot)) {
    const relativePath = relPath(dir);
    const name = path.basename(dir);
    const isApprovedProofDirectory =
      allowProofTerraformDirectory && relativePath === approvedProofTerraformDirectory;
    assert(
      name !== '.terraform' || isApprovedProofDirectory,
      `Unexpected .terraform directory: ${relativePath}`,
    );
    assert(name !== '.terraform.d', `Unexpected Terraform CLI config/cache directory: ${relativePath}`);
    assert(name !== 'terraform-plugin-cache', `Unexpected Terraform plugin cache directory: ${relativePath}`);
  }

  assert(
    JSON.stringify(filesystemLockFiles) === JSON.stringify([...approvedLockFiles].sort()),
    `Filesystem lock files must be exactly: ${approvedLockFiles.join(', ')}`,
  );
  assert(
    JSON.stringify(trackedLockFiles) === JSON.stringify([...approvedLockFiles].sort()),
    `Tracked lock files must be exactly: ${approvedLockFiles.join(', ')}`,
  );

  for (const lockFile of approvedLockFiles) {
    assert(trackedFiles.has(lockFile), `Approved lock file must be tracked by Git: ${lockFile}`);
    assert(!modifiedFiles.has(lockFile), `Approved lock file must not differ from HEAD: ${lockFile}`);
    assert(!stagedFiles.has(lockFile), `Approved lock file must not be staged: ${lockFile}`);
  }

  for (const lockFile of filesystemLockFiles) {
    assert(allowedLockFiles.has(lockFile), `Unexpected or untracked Terraform lock file: ${lockFile}`);
    assert(trackedFiles.has(lockFile), `Terraform lock file must be tracked by Git: ${lockFile}`);
  }

  for (const file of listFiles(terraformRoot)) {
    const relativePath = relPath(file);
    const name = path.basename(file);

    if (name === '.terraform.lock.hcl') {
      assert(allowedLockFiles.has(relativePath), `Unexpected lock file for this slice: ${relativePath}`);
    }

    assert(!/^terraform\.tfstate(\.backup)?$/.test(name) && !name.includes('.tfstate.'), `Unexpected Terraform state file: ${relativePath}`);
    assert(!/\.(tfplan|plan)$/.test(name), `Unexpected Terraform plan artifact: ${relativePath}`);
    assert(!/^crash(\..*)?\.log$/.test(name), `Unexpected Terraform crash log: ${relativePath}`);
    assert(!/^(override|.*_override)\.tf(\.json)?$/.test(name), `Unexpected Terraform override file: ${relativePath}`);
    assert(!(name.endsWith('.tfvars') || name.endsWith('.tfvars.json')), `Real tfvars file must not be present: ${relativePath}`);
  }
}

function validateTerraformSource() {
  const tfText = listFiles(proofRoot)
    .filter((file) => file.endsWith('.tf'))
    .map((file) => normalizeNewlines(readFileSync(file, 'utf8')))
    .join('\n');
  const active = stripComments(tfText);

  assertNoPattern(active, /^\s*data\s+"/m, 'Proof Terraform must not contain data sources');
  assertNoPattern(active, /^\s*backend\s+"/m, 'Proof Terraform must not configure a remote backend');
  assertNoPattern(active, /^\s*(module|import|moved|provisioner)\s+"/m, 'Proof Terraform must not contain module, import, moved, or provisioner blocks');

  const resources = [...active.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)].map((match) => `${match[1]}.${match[2]}`).sort();
  assert(JSON.stringify(resources) === JSON.stringify([...expectedResources].sort()), `Proof Terraform resources must be exactly: ${expectedResources.join(', ')}`);

  assertContains(active, /default\s*=\s*"ap-south-1"[\s\S]*condition\s*=\s*var\.aws_region\s*==\s*"ap-south-1"/, 'aws_region guardrail must remain ap-south-1');
  assertContains(active, /default\s*=\s*"t3\.large"[\s\S]*condition\s*=\s*var\.instance_type\s*==\s*"t3\.large"/, 'instance_type guardrail must remain t3.large only');
  assertContains(active, /root_volume_size_gib[\s\S]*default\s*=\s*40[\s\S]*condition\s*=\s*var\.root_volume_size_gib\s*==\s*40/, 'root volume guardrail must remain 40 GiB');
  assertContains(active, /associate_public_ip[\s\S]*default\s*=\s*true[\s\S]*condition\s*=\s*var\.associate_public_ip\s*==\s*true/, 'public IPv4 guardrail must remain true');
  assertContains(active, /detailed_monitoring[\s\S]*default\s*=\s*false[\s\S]*condition\s*=\s*var\.detailed_monitoring\s*==\s*false/, 'detailed monitoring guardrail must remain false');
  assertContains(active, /approved_ingress_cidr[\s\S]*\/32/, 'approved ingress CIDR guardrail must remain /32');

  for (const required of ['proof_expires_at', 'approved_domain', 'approved_ingress_cidr', 'ami_id', 'cost_approval_reference']) {
    const variable = hclBlock(active, new RegExp(`variable\\s+"${required}"\\s*{`, 'm'));
    assert(variable && !/default\s*=/.test(variable), `${required} must remain required with no default`);
  }

  const outputs = read('infra/terraform/environments/proof/outputs.tf');
  assertNoPattern(outputs, /user_data|private_key|password|token|secret|metadata_options/i, 'Proof outputs must remain safe');
}

function validateReadinessDocumentation() {
  const relativePath = 'infra/terraform/README.md';
  const text = read(relativePath);
  const normalized = text.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  validateSafeText(relativePath, text);

  const requiredPhrases = [
    'terraform source exists',
    'init readiness artifacts exist',
    'terraform has not been installed or executed in this slice',
    'providers have not been downloaded',
    '.terraform.lock.hcl has not been generated by this slice',
    'aws identity has not been queried',
    'credentials have not been accessed',
    'no backend has been initialized',
    'no state exists from this slice',
    'no plan exists',
    'no resources exist from this slice',
    'aws spend remains usd 0',
    'separate explicit approval to install or use terraform',
    'approved terraform cli version',
    'repository branch and clean tree confirmed',
    'approved aws region: ap-south-1',
    'approved ubuntu server 24.04 lts x86_64 ami id',
    'approved tester ipv4 /32',
    'approved user-owned domain or subdomain',
    'approved dns-01 certificate workflow',
    'approved proof expiry timestamp',
    'approved cost reference and maximum direct cost',
    'approved temporary least-privileged aws identity',
    'explicit approval before reading credentials or calling sts',
    'no remote backend',
    'local-state handling and backup decision',
    'no pre-existing generated terraform artifacts exist',
    'rollback and evidence locations',
    'separate approval gates for init, plan, and apply',
    'provider checksums must be generated by terraform, not handwritten',
    'slice 5b does not create or fabricate lock files',
    'local state must never be casually deleted',
    'rollback does not mean deleting state or cloud resources',
  ];

  for (const phrase of requiredPhrases) {
    assert(normalized.includes(phrase), `${relativePath} missing readiness guidance: ${phrase}`);
  }
}

function validatePackageScript() {
  const pkg = JSON.parse(read('package.json'));
  assert(
    pkg.scripts?.['check:terraform-init-readiness'] === 'node scripts/validate-terraform-init-readiness.mjs',
    'package.json must expose check:terraform-init-readiness',
  );
}

validateTfvarsExample();
for (const argument of unexpectedArguments) {
  assert(false, `Unknown argument: ${argument}`);
}
validateGitignore();
validateGeneratedArtifacts();
validateTerraformSource();
validateReadinessDocumentation();
validatePackageScript();

if (errors.length > 0) {
  console.error('Terraform init readiness validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Terraform init readiness validation passed.');
