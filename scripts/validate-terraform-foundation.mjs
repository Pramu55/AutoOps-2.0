import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const foundationRoot = path.join(repoRoot, 'infra', 'terraform');
const environmentsRoot = path.join(foundationRoot, 'environments');
const envs = ['proof', 'production'];
const expectedFiles = [
  'infra/terraform/README.md',
  'infra/terraform/environments/proof/versions.tf',
  'infra/terraform/environments/proof/providers.tf',
  'infra/terraform/environments/proof/variables.tf',
  'infra/terraform/environments/proof/locals.tf',
  'infra/terraform/environments/proof/outputs.tf',
  'infra/terraform/environments/proof/terraform.tfvars.example',
  'infra/terraform/environments/proof/.terraform.lock.hcl',
  'infra/terraform/environments/production/versions.tf',
  'infra/terraform/environments/production/providers.tf',
  'infra/terraform/environments/production/variables.tf',
  'infra/terraform/environments/production/locals.tf',
  'infra/terraform/environments/production/outputs.tf',
  'infra/terraform/environments/production/terraform.tfvars.example',
  'infra/terraform/environments/production/.terraform.lock.hcl',
  'scripts/validate-terraform-foundation.mjs',
];
const requiredVariables = [
  'project_name',
  'environment',
  'aws_region',
  'owner',
  'cost_center',
  'managed_by',
  'data_classification',
];
const requiredTags = [
  'Project',
  'Environment',
  'ManagedBy',
  'Owner',
  'CostCenter',
  'DataClassification',
  'Repository',
  'Gate',
  'Slice',
];
const requiredOutputs = [
  'name_prefix',
  'standard_tags',
  'selected_region',
  'selected_environment',
];
const expectedScript = 'node scripts/validate-terraform-foundation.mjs';
const approvedLockFiles = [
  'infra/terraform/environments/proof/.terraform.lock.hcl',
  'infra/terraform/environments/production/.terraform.lock.hcl',
];
const errors = [];

function relPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function filePath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function read(relativePath) {
  return readFileSync(filePath(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
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

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#') && !line.trimStart().startsWith('//'))
    .join('\n');
}

function assertNoPattern(text, pattern, message) {
  assert(!pattern.test(text), message);
}

function assertContains(text, pattern, message) {
  assert(pattern.test(text), message);
}

function terraformFile(env, name) {
  return `infra/terraform/environments/${env}/${name}`;
}

function validateExpectedFiles() {
  for (const relativePath of expectedFiles) {
    assert(existsFile(relativePath), `Missing expected file: ${relativePath}`);
  }
}

function validatePackageJson() {
  const pkg = JSON.parse(read('package.json'));
  assert(
    pkg.scripts?.['check:terraform-foundation'] === expectedScript,
    `package.json must define check:terraform-foundation as "${expectedScript}"`,
  );
}

function validateGitignore() {
  const gitignore = read('.gitignore');
  const requiredRules = [
    '.terraform/',
    '**/.terraform/*',
    '*.tfstate',
    '*.tfstate.*',
    '*.tfvars',
    '*.tfvars.json',
    '!*.tfvars.example',
    'override.tf',
    'override.tf.json',
    '*_override.tf',
    '*_override.tf.json',
    '.terraformrc',
    'terraform.rc',
    'crash.log',
    'crash.*.log',
    '!infra/terraform/environments/proof/.terraform.lock.hcl',
    '!infra/terraform/environments/production/.terraform.lock.hcl',
  ];

  for (const rule of requiredRules) {
    assert(
      gitignore.split(/\r?\n/).includes(rule),
      `.gitignore must include Terraform safety rule: ${rule}`,
    );
  }
}

function validateSafeContent(relativePath, { terraformOnly = false } = {}) {
  const text = read(relativePath);
  const active = stripComments(text);

  if (terraformOnly) {
    const forbiddenBlocks = ['resource', 'data', 'import', 'moved', 'backend', 'module', 'provisioner'];
    for (const block of forbiddenBlocks) {
      assertNoPattern(
        active,
        new RegExp(`(^|\\n)\\s*${block}\\s+"`, 'i'),
        `${relativePath} must not contain ${block} blocks`,
      );
    }

    assertNoPattern(
      active,
      /\bterraform\s+(apply|destroy)\b|-auto-approve/i,
      `${relativePath} must not contain active apply, destroy, or -auto-approve instructions`,
    );
  }

  assertNoPattern(
    active,
    /\b(access_key|secret_key|session_token|aws_access_key_id|aws_secret_access_key|aws_session_token)\b\s*=/i,
    `${relativePath} must not configure provider credentials`,
  );
  assertNoPattern(active, /\b\d{12}\b/, `${relativePath} must not contain likely AWS account IDs`);
  assertNoPattern(
    active,
    /(^|[^.\w-])password\s*=\s*["']?[^"'\s#]+/i,
    `${relativePath} must not contain plaintext password assignments`,
  );
  assertNoPattern(
    active,
    /(^|[^.\w-])token\s*=\s*["']?[^"'\s#]+/i,
    `${relativePath} must not contain plaintext token assignments`,
  );
  assertNoPattern(
    text,
    /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i,
    `${relativePath} must not contain private keys`,
  );
  assertNoPattern(
    active,
    /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i,
    `${relativePath} must not contain connection strings with credentials`,
  );
  assertNoPattern(
    active,
    /0\.0\.0\.0\/0[\s\S]{0,120}\b(5432|6379)\b|\b(5432|6379)\b[\s\S]{0,120}0\.0\.0\.0\/0/i,
    `${relativePath} must not guide public PostgreSQL or Redis access`,
  );
}

function validateGeneratedArtifacts() {
  const files = listFiles(foundationRoot);
  const directories = listDirectories(foundationRoot);
  const approvedLocks = new Set(approvedLockFiles);

  for (const dir of directories) {
    assert(path.basename(dir) !== '.terraform', `Unexpected .terraform directory: ${relPath(dir)}`);
  }

  for (const file of files) {
    const relativePath = relPath(file);
    const name = path.basename(file);

    if (name === '.terraform.lock.hcl') {
      assert(approvedLocks.has(relativePath), `Unexpected Terraform lock file: ${relativePath}`);
    }

    assert(
      !/^terraform\.tfstate(\.backup)?$/.test(name) && !name.includes('.tfstate.'),
      `Unexpected Terraform state file: ${relativePath}`,
    );
    assert(!/^crash(\..*)?\.log$/.test(name), `Unexpected Terraform crash log: ${relativePath}`);
  }
}

function validateLockFiles() {
  const proofLock = read('infra/terraform/environments/proof/.terraform.lock.hcl');
  const productionLock = read('infra/terraform/environments/production/.terraform.lock.hcl');

  assert(proofLock === productionLock, 'Proof and production lock files must be byte-for-byte identical');

  for (const relativePath of approvedLockFiles) {
    const text = read(relativePath);
    validateSafeContent(relativePath);
    assertContains(
      text,
      /provider\s+"registry\.terraform\.io\/hashicorp\/aws"\s*{/,
      `${relativePath} must lock registry.terraform.io/hashicorp/aws`,
    );

    const version = text.match(/version\s+=\s+"([^"]+)"/)?.[1] ?? '';
    const versionParts = version.split('.').map((part) => Number.parseInt(part, 10));
    assert(
      versionParts.length >= 3 &&
        versionParts.every((part) => Number.isInteger(part)) &&
        versionParts[0] >= 6 &&
        versionParts[0] < 7,
      `${relativePath} selected provider version must satisfy >= 6.0.0 and < 7.0.0`,
    );
    assertContains(
      text,
      /constraints\s+=\s+">=\s*6\.0\.0,\s*<\s*7\.0\.0"/,
      `${relativePath} must preserve AWS provider constraints >= 6.0.0 and < 7.0.0`,
    );
    assertContains(text, /hashes\s+=\s+\[/, `${relativePath} must include provider checksum entries`);
    assertContains(text, /"h1:[^"]+"/, `${relativePath} must include h1 checksum entries`);
    assertContains(text, /"zh:[a-f0-9]+"/, `${relativePath} must include zh checksum entries`);
  }
}

function validateVersions(env) {
  const relativePath = terraformFile(env, 'versions.tf');
  const text = read(relativePath);
  assertContains(
    text,
    /required_version\s*=\s*">=\s*1\.9\.0,\s*<\s*2\.0\.0"/,
    `${relativePath} must require Terraform >= 1.9.0, < 2.0.0`,
  );
  assertContains(
    text,
    /source\s*=\s*"hashicorp\/aws"[\s\S]*version\s*=\s*">=\s*6\.0\.0,\s*<\s*7\.0\.0"/,
    `${relativePath} must require AWS provider >= 6.0.0, < 7.0.0`,
  );
}

function validateProvider(env) {
  const relativePath = terraformFile(env, 'providers.tf');
  const text = read(relativePath);
  const active = stripComments(text);
  const requiredProviderLines = [
    /region\s*=\s*var\.aws_region/,
    /skip_credentials_validation\s*=\s*true/,
    /skip_requesting_account_id\s*=\s*true/,
    /skip_metadata_api_check\s*=\s*true/,
    /skip_region_validation\s*=\s*true/,
    /default_tags\s*{/,
    /tags\s*=\s*local\.standard_tags/,
  ];

  for (const pattern of requiredProviderLines) {
    assertContains(active, pattern, `${relativePath} is missing required provider setting ${pattern}`);
  }

  assertNoPattern(
    active,
    /\b(profile|assume_role|allowed_account_ids|forbidden_account_ids)\b/i,
    `${relativePath} must not configure profiles, role assumption, or account allowlists`,
  );
}

function validateVariables(env) {
  const relativePath = terraformFile(env, 'variables.tf');
  const text = read(relativePath);

  for (const variable of requiredVariables) {
    assertContains(text, new RegExp(`variable\\s+"${variable}"`), `${relativePath} missing ${variable}`);
  }

  const expectedEnvironment = env === 'proof' ? 'proof' : 'production';
  assertContains(
    text,
    new RegExp(`default\\s*=\\s*"${expectedEnvironment}"[\\s\\S]*condition\\s*=\\s*var\\.environment\\s*==\\s*"${expectedEnvironment}"`),
    `${relativePath} must enforce distinct ${expectedEnvironment} environment validation`,
  );
  assertContains(
    text,
    /condition\s*=\s*var\.aws_region\s*==\s*"ap-south-1"/,
    `${relativePath} must enforce ap-south-1 locally`,
  );

  if (env === 'proof') {
    assertContains(
      text,
      /contains\(\["disposable",\s*"internal"\],\s*var\.data_classification\)/,
      `${relativePath} must allow only proof data classifications`,
    );
  } else {
    assertContains(
      text,
      /contains\(\["internal",\s*"restricted"\],\s*var\.data_classification\)/,
      `${relativePath} must allow only production data classifications`,
    );
  }
}

function validateLocals(env) {
  const relativePath = terraformFile(env, 'locals.tf');
  const text = read(relativePath);
  assertContains(
    text,
    /name_prefix\s*=\s*"\$\{var\.project_name\}-\$\{var\.environment\}"/,
    `${relativePath} must define deterministic local.name_prefix`,
  );

  for (const tag of requiredTags) {
    assertContains(text, new RegExp(`\\b${tag}\\s*=`), `${relativePath} missing standard tag ${tag}`);
  }
}

function validateOutputs(env) {
  const relativePath = terraformFile(env, 'outputs.tf');
  const text = read(relativePath);

  for (const output of requiredOutputs) {
    assertContains(text, new RegExp(`output\\s+"${output}"`), `${relativePath} missing output ${output}`);
  }

  const sensitiveFalseCount = [...text.matchAll(/sensitive\s*=\s*false/g)].length;
  assert(
    sensitiveFalseCount === requiredOutputs.length,
    `${relativePath} must mark all outputs sensitive = false`,
  );
}

function validateTfvarsExample(env) {
  const relativePath = terraformFile(env, 'terraform.tfvars.example');
  const text = read(relativePath);
  const active = stripComments(text);
  const keys = [...active.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((match) => match[1]);
  const unexpected = keys.filter((key) => !requiredVariables.includes(key));
  const missing = requiredVariables.filter((key) => !keys.includes(key));

  assert(unexpected.length === 0, `${relativePath} contains unexpected keys: ${unexpected.join(', ')}`);
  assert(missing.length === 0, `${relativePath} is missing keys: ${missing.join(', ')}`);
  assertNoPattern(
    active,
    /(secret|password|token|credential|access_key|account_id)\s*=/i,
    `${relativePath} must not contain suspicious secret-bearing keys`,
  );
}

function validateReadme() {
  const text = read('infra/terraform/README.md');
  const requiredPhrases = [
    'zero resources',
    'does not require AWS credentials',
    'does not require AWS API calls',
    'incurs no AWS cost',
    'pnpm.cmd run check:terraform-foundation',
    'pnpm run check:terraform-foundation',
    'terraform fmt -check -recursive infra/terraform/environments',
    'terraform -chdir=infra/terraform/environments/proof init -backend=false',
    'terraform -chdir=infra/terraform/environments/proof validate',
    'terraform -chdir=infra/terraform/environments/production init -backend=false',
    'terraform -chdir=infra/terraform/environments/production validate',
    'Terraform apply and Terraform destroy are prohibited in Slice 2.',
  ];

  for (const phrase of requiredPhrases) {
    assert(text.includes(phrase), `README missing required guidance: ${phrase}`);
  }
}

function validateScanScope() {
  const forbiddenRoots = [
    path.join(foundationRoot, 'aws-sample-ecs-app'),
    path.join(foundationRoot, 'local-smoke'),
  ];
  const scannedRoots = [
    path.join(foundationRoot, 'README.md'),
    path.join(environmentsRoot, 'proof'),
    path.join(environmentsRoot, 'production'),
    path.join(repoRoot, 'scripts', 'validate-terraform-foundation.mjs'),
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, '.gitignore'),
  ];

  for (const root of scannedRoots) {
    for (const forbiddenRoot of forbiddenRoots) {
      assert(
        !root.startsWith(forbiddenRoot),
        `Validator scan scope must exclude existing workspace: ${relPath(forbiddenRoot)}`,
      );
    }
  }
}

validateExpectedFiles();
validatePackageJson();
validateGitignore();
validateScanScope();
validateGeneratedArtifacts();
validateSafeContent('infra/terraform/README.md');
validateSafeContent('scripts/validate-terraform-foundation.mjs');
validateSafeContent('package.json');
validateSafeContent('.gitignore');
validateReadme();
validateLockFiles();

for (const env of envs) {
  for (const name of ['versions.tf', 'providers.tf', 'variables.tf', 'locals.tf', 'outputs.tf']) {
    validateSafeContent(terraformFile(env, name), { terraformOnly: true });
  }
  validateSafeContent(terraformFile(env, 'terraform.tfvars.example'));
  validateVersions(env);
  validateProvider(env);
  validateVariables(env);
  validateLocals(env);
  validateOutputs(env);
  validateTfvarsExample(env);
}

if (errors.length > 0) {
  console.error('Terraform foundation validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Terraform foundation validation passed.');
