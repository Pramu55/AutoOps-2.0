import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const errors = [];

const docPath = 'docs/cloud/AWS_IDENTITY_CREDENTIAL_READINESS_PACKAGE.md';
const readmePath = 'infra/terraform/README.md';
const providerPath = 'infra/terraform/environments/proof/providers.tf';
const validatorPath = 'scripts/validate-aws-identity-credential-readiness.mjs';
const expectedScript = 'node scripts/validate-aws-identity-credential-readiness.mjs';
const exactFutureCommand = 'aws sts get-caller-identity --output json --no-cli-pager';
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

function read(relativePath) {
  return normalizeNewlines(readFileSync(filePath(relativePath), 'utf8'));
}

function existsFile(relativePath) {
  try {
    return statSync(filePath(relativePath)).isFile();
  } catch {
    return false;
  }
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

function normalizedText(text) {
  return text.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
}

function validateSecretAbsence(relativePath, text) {
  const checks = [
    [/\bAKIA[A-Z0-9]{16}\b/, 'AKIA access key values'],
    [/\bASIA[A-Z0-9]{16}\b/, 'ASIA session access key values'],
    [/\b(?:aws_)?secret(?:_access)?_key\b\s*[:=]\s*["']?[^"'\s<]+/i, 'secret access key assignments'],
    [/\b(?:aws_)?session_token\b\s*[:=]\s*["']?[^"'\s<]+/i, 'session token assignments'],
    [/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, 'private key blocks'],
    [/\bAWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|PROFILE)\b\s*[:=]\s*["']?[^"'\s<]+/i, 'AWS credential environment-variable assignments with values'],
    [/\b\d{12}\b/, 'twelve-digit account IDs'],
  ];

  for (const [pattern, label] of checks) {
    assertNoPattern(text, pattern, `${relativePath} must not contain ${label}`);
  }
}

function validateAwsCommands(text) {
  const lines = text.split('\n');
  const commandLikeLines = lines
    .map((line) => line.trim().replace(/^>\s*/, ''))
    .filter((line) => /^aws(?:\.exe)?\s+/.test(line));

  assert(
    commandLikeLines.length === 1 && commandLikeLines[0] === exactFutureCommand,
    `${docPath} must document only the exact future AWS command`,
  );

  for (const line of commandLikeLines) {
    assert(line === exactFutureCommand, `${docPath} contains unapproved AWS command: ${line}`);
    assertNoPattern(
      line,
      /\b(ec2|iam|s3|cloudformation|ssm|route53|rds|elasticache|ecr|ecs|logs|pricing|organizations)\b/i,
      `${docPath} must not document AWS commands for other services or operations`,
    );
  }
}

function validateDocument() {
  assert(existsFile(docPath), `${docPath} must exist`);
  const text = read(docPath);
  const normalized = normalizedText(text);
  validateSecretAbsence(docPath, text);
  validateAwsCommands(text);

  const requiredPhrases = [
    '# gate 3 slice 5f aws identity and credential readiness package',
    'offline only',
    'aws credentials were not accessed',
    'aws profiles were not inspected',
    'aws environment variables were not inspected',
    'sts was not called',
    'aws apis were not accessed',
    'aws cli was not executed',
    'terraform was not executed',
    'docker was not accessed',
    'no resources were created',
    'aws spend remains usd 0',
    'existing provider boundary',
    'skip_credentials_validation = true',
    'skip_requesting_account_id = true',
    'skip_metadata_api_check = true',
    'skip_region_validation = true',
    'support offline/static preparation',
    'do not prove aws identity',
    'do not authorize credential use',
    'do not replace sts identity verification',
    'must not be silently treated as account validation',
    'this command is documented only and must not be executed in slice 5f',
    'no other aws command is approved by this package',
    'separately approved exact aws cli binary path and version',
    'exact git branch',
    'exact commit sha',
    'exact tree sha',
    'clean working tree',
    'synchronization with origin',
    'approval reference',
    'approval timestamp',
    'approval expiry',
    'exact aws cli executable absolute path',
    'approved aws cli version',
    'approved aws cli sha-256 checksum',
    'explicitly selected credential source type',
    'explicitly selected region ap-south-1',
    'expected aws account id captured privately',
    'expected iam principal type',
    'expected iam principal arn pattern captured privately',
    'expected session expiry',
    'separate approval to access credentials',
    'separate approval to execute sts getcalleridentity',
    'separate approval for terraform plan',
    'separate approval for terraform apply',
    'cost confirmation of usd 0 for identity lookup',
    'confirmation that no resource mutation is authorized',
    'only one explicitly approved credential source',
    'temporary aws iam identity center or sso session',
    'temporary assumed-role session',
    'short-lived environment/session credentials supplied outside the repository',
    'short-lived credentials are preferred',
    'root-user credentials',
    'long-lived iam user access keys',
    'ambiguous default-profile fallback',
    'automatic credential-chain selection without approval',
    'identity lookup approval does not authorize resource creation or resource mutation',
    'sts:getcalleridentity',
    'do not claim that sts:getcalleridentity alone will be sufficient for terraform plan',
    'terraform plan permissions must be reviewed separately against the exact ten-resource proof scope',
    'account id, arn, and role-session identifiers are sensitive operational metadata',
    'must not be published in public pr comments, screenshots, or logs',
    'access key id',
    'secret access key',
    'session token',
    'sso token',
    'credential-process output',
    'cached credential content',
    'browser authentication tokens',
    'mfa seed',
    'private keys',
    'complete credential files',
    'environment-variable values containing credentials',
    'secret values must never be echoed, hashed as evidence, copied, logged, or committed',
    'branch, commit, or tree differs',
    'working tree is dirty',
    'origin synchronization differs',
    'approval is missing or expired',
    'aws cli path differs',
    'aws cli version differs',
    'aws cli checksum differs',
    'credential source differs from approval',
    'root credentials are detected or suspected',
    'long-lived access keys are detected or suspected',
    'expected account id is absent',
    'expected principal arn pattern is absent',
    'returned account differs',
    'returned arn differs from the expected pattern',
    'session expiry is missing, already expired, or too long',
    'credential values would be printed',
    'output includes unexpected secret-like material',
    'command differs from the exact approved getcalleridentity command',
    'any mutating aws command is requested',
    'terraform plan is attempted in the same gate',
    'cost or account ownership is uncertain',
    'identity readiness does not approve identity execution',
    'identity execution does not approve terraform plan',
    'terraform plan does not approve apply',
    'apply remains prohibited until separate review and approval',
    'expected maximum infrastructure cost remains usd 2',
    'identity lookup itself must create zero resources and incur no expected resource cost',
  ];

  for (const phrase of requiredPhrases) {
    assert(normalized.includes(phrase), `${docPath} missing required phrase: ${phrase}`);
  }

  for (const resource of expectedResources) {
    assert(text.includes(resource), `${docPath} must reference proof resource ${resource}`);
  }
}

function validateReadme() {
  assert(existsFile(readmePath), `${readmePath} must exist`);
  const text = read(readmePath);
  const normalized = normalizedText(text);

  const requiredPhrases = [
    'gate 3 slice 5f aws identity and credential readiness',
    'offline preparation only',
    'current provider skip settings do not prove identity',
    'no credentials, profiles, or environment variables were inspected',
    'sts and aws apis were not called',
    'no aws command was executed',
    'terraform and docker were not executed',
    'no resources were created',
    'spend remains usd 0',
    'later identity verification requires separate approval',
    'later plan and apply remain separate approval gates',
    'pnpm.cmd run check:aws-identity-credential-readiness',
  ];

  for (const phrase of requiredPhrases) {
    assert(normalized.includes(phrase), `${readmePath} missing Slice 5F phrase: ${phrase}`);
  }
}

function validatePackageScript() {
  const pkg = JSON.parse(read('package.json'));
  assert(
    pkg.scripts?.['check:aws-identity-credential-readiness'] === expectedScript,
    `package.json must define check:aws-identity-credential-readiness as ${expectedScript}`,
  );
}

function validateProviderBoundary() {
  const text = read(providerPath);
  for (const setting of [
    'skip_credentials_validation',
    'skip_requesting_account_id',
    'skip_metadata_api_check',
    'skip_region_validation',
  ]) {
    assertContains(text, new RegExp(`${setting}\\s*=\\s*true`), `${providerPath} must keep ${setting} = true`);
  }
}

function validateValidatorSource() {
  const text = read(validatorPath);
  assertNoPattern(
    text,
    /from\s+['"]node:child_process['"]|require\(['"]node:child_process['"]\)/,
    `${validatorPath} must not contain process execution helpers`,
  );
  assertNoPattern(
    text,
    /(?:^|\n)\s*(?:await\s+)?[\w.]+\s*\(\s*['"](?:aws|terraform|docker)(?:\.exe)?['"]/i,
    `${validatorPath} must not contain AWS, Terraform, or Docker process execution`,
  );
}

validateDocument();
validateReadme();
validatePackageScript();
validateProviderBoundary();
validateValidatorSource();

if (errors.length > 0) {
  console.error('AWS identity and credential readiness validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('AWS identity and credential readiness validation passed.');
