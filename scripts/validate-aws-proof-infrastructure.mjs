import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const proofRoot = path.join(repoRoot, 'infra', 'terraform', 'environments', 'proof');
const errors = [];
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

const allowedResourceTypes = new Set([
  'aws_vpc',
  'aws_subnet',
  'aws_internet_gateway',
  'aws_route_table',
  'aws_route_table_association',
  'aws_security_group',
  'aws_iam_role',
  'aws_iam_role_policy_attachment',
  'aws_iam_instance_profile',
  'aws_instance',
]);

const forbiddenResourceTypes = [
  'aws_eip',
  'aws_nat_gateway',
  'aws_vpc_endpoint',
  'aws_lb',
  'aws_db_instance',
  'aws_elasticache',
  'aws_route53',
  'aws_acm',
  'aws_key_pair',
];
const approvedOutputs = [
  'instance_id',
  'public_ipv4',
  'public_url',
  'ssm_target_id',
  'proof_expires_at',
  'estimated_hourly_cost_usd',
  'security_group_id',
];

function relPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function filePath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
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

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#') && !line.trimStart().startsWith('//'))
    .join('\n');
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
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

function block(text, blockType, firstLabel, secondLabel) {
  return hclBlock(text, new RegExp(`${blockType}\\s+"${firstLabel}"\\s+"${secondLabel}"\\s*{`, 'm'));
}

function variableBlock(text, name) {
  return hclBlock(text, new RegExp(`variable\\s+"${name}"\\s*{`, 'm'));
}

function validateSafeContent(relativePath) {
  const text = read(relativePath);
  const active = stripComments(text);

  assertNoPattern(
    active,
    /\b(access_key|secret_key|session_token|aws_access_key_id|aws_secret_access_key|aws_session_token|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\b\s*[:=]/,
    `${relativePath} must not contain AWS credential assignments`,
  );
  assertNoPattern(active, /\b\d{12}\b/, `${relativePath} must not contain likely AWS account IDs`);
  assertNoPattern(
    active,
    /(^|[^.\w-])password\s*[:=]\s*["']?[^"'\s#${][^"'\s#]*/i,
    `${relativePath} must not contain plaintext password assignments`,
  );
  assertNoPattern(
    active,
    /(^|[^.\w-])token\s*[:=]\s*["']?[^"'\s#${][^"'\s#]*/i,
    `${relativePath} must not contain plaintext token assignments`,
  );
  assertNoPattern(text, /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i, `${relativePath} must not contain private keys`);
  assertNoPattern(active, /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i, `${relativePath} must not contain credentialed URLs`);
}

function validateGeneratedArtifacts() {
  for (const dir of listDirectories(path.join(repoRoot, 'infra', 'terraform'))) {
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

  for (const file of listFiles(path.join(repoRoot, 'infra', 'terraform'))) {
    const name = path.basename(file);
    assert(!/^terraform\.tfstate(\.backup)?$/.test(name) && !name.includes('.tfstate.'), `Unexpected Terraform state file: ${relPath(file)}`);
    assert(!/\.(tfplan|plan)$/.test(name), `Unexpected Terraform plan artifact: ${relPath(file)}`);
    assert(!/^crash(\..*)?\.log$/.test(name), `Unexpected Terraform crash log: ${relPath(file)}`);
  }
}

function validateTerraform() {
  const requiredFiles = [
    'infra/terraform/environments/proof/main.tf',
    'infra/terraform/environments/proof/user-data.sh.tftpl',
    'infra/terraform/environments/proof/variables.tf',
    'infra/terraform/environments/proof/locals.tf',
    'infra/terraform/environments/proof/outputs.tf',
  ];

  for (const relativePath of requiredFiles) {
    assert(existsSync(filePath(relativePath)) && statSync(filePath(relativePath)).isFile(), `Missing required file: ${relativePath}`);
    validateSafeContent(relativePath);
  }

  const tfText = listFiles(proofRoot)
    .filter((file) => file.endsWith('.tf'))
    .map((file) => normalizeNewlines(readFileSync(file, 'utf8')))
    .join('\n');
  const active = stripComments(tfText);

  assertNoPattern(active, /^\s*data\s+"/m, 'Proof Terraform must not contain data sources');
  assertNoPattern(active, /^\s*(backend|module|import|moved|provisioner)\s+"/m, 'Proof Terraform must not contain backend, module, import, moved, or provisioner blocks');

  const resources = [...active.matchAll(/resource\s+"([^"]+)"\s+"([^"]+)"/g)].map((match) => ({
    type: match[1],
    name: match[2],
    address: `${match[1]}.${match[2]}`,
  }));
  const actual = resources.map((resource) => resource.address).sort();
  const expected = [...expectedResources].sort();

  assert(actual.length === expected.length, `Expected exactly ${expected.length} Terraform resources, found ${actual.length}`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Terraform resource addresses must be exactly: ${expected.join(', ')}`);

  for (const resource of resources) {
    assert(allowedResourceTypes.has(resource.type), `Forbidden or unexpected Terraform resource type: ${resource.type}`);
  }

  for (const type of forbiddenResourceTypes) {
    assertNoPattern(active, new RegExp(`resource\\s+"${type}`), `Forbidden Terraform resource type present: ${type}`);
  }

  assertContains(active, /default\s*=\s*"ap-south-1"[\s\S]*condition\s*=\s*var\.aws_region\s*==\s*"ap-south-1"/, 'aws_region must default to and validate ap-south-1');
  assertContains(active, /variable\s+"instance_type"[\s\S]*default\s*=\s*"t3\.large"[\s\S]*condition\s*=\s*var\.instance_type\s*==\s*"t3\.large"/, 'instance_type must default to and validate only t3.large');
  assertContains(active, /variable\s+"ami_id"[\s\S]*regex\("\^ami-\[0-9a-f\]\{8,17\}\$"/, 'ami_id must be an explicit required AMI variable with AMI ID validation');
  assertContains(active, /variable\s+"approved_ingress_cidr"[\s\S]*\/32/, 'approved_ingress_cidr must require a single IPv4 /32');

  for (const required of ['proof_expires_at', 'approved_domain', 'approved_ingress_cidr', 'ami_id', 'cost_approval_reference']) {
    const variable = variableBlock(active, required);
    assert(variable && !/default\s*=/.test(variable), `${required} must be required and have no default`);
  }

  assertContains(block(active, 'resource', 'aws_instance', 'proof'), /associate_public_ip_address\s*=\s*var\.associate_public_ip/, 'aws_instance.proof must explicitly enable public IPv4 through the approved guardrail');
  assertContains(block(active, 'resource', 'aws_instance', 'proof'), /monitoring\s*=\s*var\.detailed_monitoring/, 'aws_instance.proof must use detailed_monitoring guardrail');
  assertContains(block(active, 'resource', 'aws_instance', 'proof'), /volume_type\s*=\s*"gp3"[\s\S]*volume_size\s*=\s*var\.root_volume_size_gib[\s\S]*encrypted\s*=\s*true[\s\S]*delete_on_termination\s*=\s*true/, 'root volume must be 40 GiB encrypted gp3 and delete on termination');
  assertContains(block(active, 'resource', 'aws_instance', 'proof'), /http_tokens\s*=\s*"required"[\s\S]*instance_metadata_tags\s*=\s*"disabled"/, 'aws_instance.proof must require IMDSv2 and disable metadata tags');
  assertContains(block(active, 'resource', 'aws_instance', 'proof'), /user_data\s*=\s*templatefile\("\$\{path\.module\}\/user-data\.sh\.tftpl",\s*\{\}\)/, 'user data must come from the minimal template without variables');

  const sg = block(active, 'resource', 'aws_security_group', 'proof_instance');
  const ingressBlocks = [...sg.matchAll(/ingress\s*{[\s\S]*?}/g)].map((match) => match[0]);
  assert(ingressBlocks.length === 1, 'Security group must have exactly one ingress block');
  assertContains(ingressBlocks[0] ?? '', /from_port\s*=\s*443[\s\S]*to_port\s*=\s*443[\s\S]*protocol\s*=\s*"tcp"[\s\S]*cidr_blocks\s*=\s*\[var\.approved_ingress_cidr\]/, 'Only approved TCP 443 ingress is allowed');
  assertNoPattern(sg, /from_port\s*=\s*22|to_port\s*=\s*22/, 'Security group must not allow SSH');

  const role = block(active, 'resource', 'aws_iam_role', 'ssm_instance');
  assertContains(role, /Service\s*=\s*"ec2\.amazonaws\.com"/, 'IAM trust policy must permit EC2 only');
  assertNoPattern(role, /\*\s*["']?\s*,?\s*Action|AdministratorAccess/i, 'IAM role must not include wildcard administrative permissions');
  assertContains(active, /policy_arn\s*=\s*"arn:aws:iam::aws:policy\/AmazonSSMManagedInstanceCore"/, 'SSM core managed policy ARN must be attached');

  const userData = read('infra/terraform/environments/proof/user-data.sh.tftpl');
  assertNoPattern(userData, /\bgit\s+clone\b|docker\s+compose\s+up|DATABASE_URL|JWT|GITHUB|TOKEN|PRIVATE KEY|CERTIFICATE-----/i, 'user data must not deploy app code, secrets, certificates, or start Compose');
  assertNoPattern(userData, /apt-get install[^\n]*amazon-ssm-agent/, 'user data must not install amazon-ssm-agent with apt-get');
  assertNoPattern(userData, /systemctl enable --now amazon-ssm-agent/, 'user data must not use direct systemctl startup for Ubuntu SSM Agent');
  assertContains(userData, /snap list amazon-ssm-agent[\s\S]*snap start amazon-ssm-agent[\s\S]*snap install amazon-ssm-agent --classic[\s\S]*snap services amazon-ssm-agent/, 'user data must handle SSM Agent through idempotent Snap logic');
  assertContains(userData, /amazon-ssm-agent Snap service could not be started/, 'user data must fail clearly when SSM Agent cannot start');
  assertContains(userData, /fallocate -l 2G \/swapfile/, 'user data must create the approved 2 GiB emergency swap file');
  assertContains(userData, /systemctl enable --now docker/, 'user data must enable Docker only');

  const outputs = read('infra/terraform/environments/proof/outputs.tf');
  const actualOutputs = [...outputs.matchAll(/^\s*output\s+"([^"]+)"/gm)].map((match) => match[1]).sort();
  assert(JSON.stringify(actualOutputs) === JSON.stringify([...approvedOutputs].sort()), `Proof outputs must be exactly: ${approvedOutputs.join(', ')}`);
  for (const output of approvedOutputs) {
    assertContains(outputs, new RegExp(`output\\s+"${output}"[\\s\\S]*sensitive\\s*=\\s*false`), `Missing safe non-sensitive output: ${output}`);
  }
  assertNoPattern(outputs, /user_data|private_key|password|token|secret|metadata_options/i, 'outputs must not expose secrets, rendered user data, or complete metadata');
}

function serviceBlock(text, name) {
  const pattern = new RegExp(`(?:^|\\n)  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n[a-zA-Z][^\\n]*:\\n|$)`);
  return text.match(pattern)?.[1] ?? '';
}

function validateCompose() {
  const base = read('docker-compose.prod.yml');
  const overlay = read('docker-compose.ec2-proof.yml');
  validateSafeContent('docker-compose.ec2-proof.yml');

  const baseServices = ['postgres', 'redis', 'api', 'worker', 'web'];
  const overlayServices = ['nginx', 'prometheus', 'grafana'];

  for (const service of baseServices) {
    assertContains(base, new RegExp(`^  ${service}:`, 'm'), `docker-compose.prod.yml must contain base service ${service}`);
  }
  for (const service of overlayServices) {
    assertContains(overlay, new RegExp(`^  ${service}:`, 'm'), `docker-compose.ec2-proof.yml must add ${service}`);
  }

  assertContains(overlay, /^  api:\n\s+ports:\s+!reset \[\]/m, 'overlay must clear api public ports with Compose !reset []');
  assertContains(overlay, /^  web:\n\s+ports:\s+!reset \[\]/m, 'overlay must clear web public ports with Compose !reset []');
  assertContains(serviceBlock(overlay, 'nginx'), /ports:\s*\n\s+- '443:443'/, 'nginx must publish only TCP 443');
  assertContains(serviceBlock(overlay, 'prometheus'), /ports:\s*\n\s+- '127\.0\.0\.1:9090:9090'/, 'Prometheus must bind only to loopback 127.0.0.1:9090:9090');
  assertContains(serviceBlock(overlay, 'grafana'), /ports:\s*\n\s+- '127\.0\.0\.1:3001:3000'/, 'Grafana must bind only to loopback 127.0.0.1:3001:3000');
  assertContains(serviceBlock(overlay, 'prometheus'), /--web\.listen-address=127\.0\.0\.1:9090/, 'Prometheus must not listen on 0.0.0.0');
  assertContains(serviceBlock(overlay, 'grafana'), /GF_SERVER_HTTP_ADDR:\s*127\.0\.0\.1/, 'Grafana must not listen on 0.0.0.0');

  for (const forbidden of ['"80:80"', "'80:80'", '"3000:3000"', "'3000:3000'", '"3001:3000"', "'3001:3000'", '"4000:4000"', "'4000:4000'", '"4001:4001"', "'4001:4001'", '"5432:5432"', "'5432:5432'", '"6379:6379"', "'6379:6379'", '"9090:9090"', "'9090:9090'"]) {
    assert(!overlay.includes(forbidden), `overlay must not publish forbidden port mapping ${forbidden}`);
  }
  assertNoPattern(overlay, /0\.0\.0\.0|\[::\]|['"]3001:3000['"]|['"]9090:9090['"]|published:\s*3001|published:\s*9090/i, 'observability ports must not use public, wildcard, IPv6 wildcard, or bare host publication');

  assert((overlay.match(/['"]443:443['"]/g) ?? []).length === 1, 'nginx must be the only service publishing public TCP 443');

  assertNoPattern(overlay, /\/var\/run\/docker\.sock|\.kube|kubeconfig|network_mode:\s*host|privileged:\s*true|:\s*\/app\b/i, 'overlay must not use Docker socket, kubeconfig, host networking, privileged mode, or development source mounts');
  assertContains(overlay, /\$\{AUTOOPS_PROOF_TLS_CERT_PATH:\?approved certificate path required\}/, 'nginx certificate path must be supplied by variable path only');
  assertContains(overlay, /\$\{AUTOOPS_PROOF_TLS_KEY_PATH:\?approved certificate key path required\}/, 'nginx key path must be supplied by variable path only');
  assertNoPattern(serviceBlock(overlay, 'nginx'), /grafana|prometheus/i, 'nginx must not route to Grafana or Prometheus');

  for (const service of overlayServices) {
    const blockText = serviceBlock(overlay, service);
    for (const required of ['security_opt:', 'cap_drop:', 'read_only: true', 'logging:', 'cpus:', 'mem_limit:', 'mem_reservation:', 'pids_limit:', 'healthcheck:']) {
      assert(blockText.includes(required) || overlay.includes(`x-proof-hardening`) && ['security_opt:', 'cap_drop:', 'read_only: true', 'logging:'].includes(required), `${service} must include ${required}`);
    }
  }
}

function validateDocsAndPackage() {
  const readme = read('infra/terraform/README.md');
  const readmeLower = readme.toLowerCase().replace(/`/g, '').replace(/\s+/g, ' ');
  const pkg = JSON.parse(read('package.json'));

  assert(pkg.scripts?.['check:aws-proof-infrastructure'] === 'node scripts/validate-aws-proof-infrastructure.mjs', 'package.json must expose check:aws-proof-infrastructure');
  for (const phrase of [
    'source code exists but has not been initialized or planned',
    'no AWS identity has been queried',
    'no credentials have been accessed',
    'no Terraform provider has been downloaded',
    'no AWS API has been called',
    'no resources have been created',
    'AWS spend remains USD 0',
    'later Terraform init requires separate approval',
    'later Terraform plan requires separate approval',
    'later Terraform apply requires separate explicit approval',
    'The Compose overlay has not been deployed',
    'local Terraform state',
    '!reset [] tag',
  ]) {
    assert(readmeLower.includes(phrase.toLowerCase().replace(/\s+/g, ' ')), `README missing Slice 5A boundary phrase: ${phrase}`);
  }
}

for (const argument of unexpectedArguments) {
  assert(false, `Unknown argument: ${argument}`);
}
validateGeneratedArtifacts();
validateTerraform();
validateCompose();
validateDocsAndPackage();

if (errors.length > 0) {
  console.error('AWS proof infrastructure validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('AWS proof infrastructure validation passed.');
