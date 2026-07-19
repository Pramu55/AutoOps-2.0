import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const composeFile = path.join(repoRoot, 'docker-compose.prod.yml');
const protectedVolumes = new Set([
  'autoops_postgres_data',
  'autoops_redis_data',
  'autoops_grafana_data',
  'autoops_prometheus_data',
]);
const appServices = ['api', 'worker', 'web'];
const allowedPublicPorts = new Map([
  ['api', new Set(['4000'])],
  ['web', new Set(['3000'])],
]);

function parseArgs(argv) {
  const result = { envFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--env-file') {
      result.envFile = argv[index + 1] ?? null;
      index += 1;
    }
  }
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderCompose(envFile) {
  const args = [];
  if (envFile) {
    args.push('--env-file', envFile);
  }
  args.push('-f', composeFile, 'config', '--format', 'json');

  const output = execFileSync('docker', ['compose', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output);
}

function finalDockerfileUser(dockerfilePath) {
  const text = readFileSync(path.join(repoRoot, dockerfilePath), 'utf8');
  const finalStage = text.slice(text.toUpperCase().lastIndexOf('\nFROM ') + 1);
  const users = [...finalStage.matchAll(/^\s*USER\s+([^\s#]+)/gim)];
  return users.at(-1)?.[1] ?? null;
}

function containerPort(port) {
  if (typeof port === 'string') {
    return port.split(':').at(-1)?.split('/')[0] ?? port;
  }
  return String(port?.target ?? port?.published ?? '');
}

function publishedPort(port) {
  if (typeof port === 'string') {
    const parts = port.split(':');
    return parts.length > 1 ? parts[0] : '';
  }
  return String(port?.published ?? '');
}

function serviceVolumeSource(volume) {
  if (typeof volume === 'string') {
    return volume.split(':')[0] ?? '';
  }
  return String(volume?.source ?? '');
}

function hasBlockedMount(volume) {
  const source = serviceVolumeSource(volume).replaceAll('\\', '/').toLowerCase();
  const target =
    typeof volume === 'string'
      ? volume.split(':')[1] ?? ''
      : String(volume?.target ?? volume?.source ?? '');
  const normalizedTarget = target.replaceAll('\\', '/').toLowerCase();

  return (
    source.includes('/var/run/docker.sock') ||
    normalizedTarget.includes('/var/run/docker.sock') ||
    source.includes('.kube/config') ||
    source.includes('kubeconfig') ||
    normalizedTarget.includes('.kube/config') ||
    normalizedTarget.includes('kubeconfig')
  );
}

function assertBoundedLogging(name, service) {
  assert(service.logging?.driver === 'json-file', `${name} must use json-file logging`);
  assert(service.logging?.options?.['max-size'] === '10m', `${name} log max-size must be 10m`);
  assert(service.logging?.options?.['max-file'] === '3', `${name} log max-file must be 3`);
}

function assertResources(name, service) {
  assert(service.cpus !== undefined, `${name} must set cpus`);
  assert(service.mem_limit !== undefined, `${name} must set mem_limit`);
  assert(service.mem_reservation !== undefined, `${name} must set mem_reservation`);
  assert(service.pids_limit !== undefined, `${name} must set pids_limit`);
}

function assertAppHardening(name, service) {
  const dockerfile = service.build?.dockerfile;
  assert(dockerfile, `${name} must have a Dockerfile`);
  const finalUser = finalDockerfileUser(dockerfile);
  assert(finalUser && finalUser !== 'root' && finalUser !== '0', `${name} final Dockerfile USER must be non-root`);
  assert(asArray(service.security_opt).includes('no-new-privileges:true'), `${name} must set no-new-privileges`);
  assert(asArray(service.cap_drop).includes('ALL'), `${name} must drop all capabilities`);
  assert(service.read_only === true, `${name} must enable read_only`);
  assert(asArray(service.tmpfs).some((entry) => String(entry).startsWith('/tmp:')), `${name} must declare /tmp tmpfs`);
  assertResources(name, service);
  assertBoundedLogging(name, service);
}

function assertNoUnsafeServiceConfig(name, service) {
  assert(service.privileged !== true, `${name} must not be privileged`);
  assert(service.network_mode !== 'host', `${name} must not use host network`);
  for (const volume of asArray(service.volumes)) {
    assert(!hasBlockedMount(volume), `${name} must not mount Docker socket or kubeconfig`);
    const source = serviceVolumeSource(volume);
    assert(!protectedVolumes.has(source), `${name} must not use protected development volume ${source}`);
  }
}

function assertPorts(compose) {
  for (const [name, service] of Object.entries(compose.services ?? {})) {
    for (const port of asArray(service.ports)) {
      const published = publishedPort(port);
      const target = containerPort(port);
      const allowedTargets = allowedPublicPorts.get(name) ?? new Set();

      assert(published, `${name} has an invalid host port mapping`);
      assert(allowedTargets.has(target), `${name} has unexpected public port ${published}:${target}`);
    }
  }

  assert(asArray(compose.services?.postgres?.ports).length === 0, 'postgres must not publish host ports');
  assert(asArray(compose.services?.redis?.ports).length === 0, 'redis must not publish host ports');
  assert(asArray(compose.services?.worker?.ports).length === 0, 'worker must not publish host ports');
}

function assertVolumes(compose) {
  for (const name of Object.keys(compose.volumes ?? {})) {
    assert(!protectedVolumes.has(name), `compose volume ${name} must not reference a protected development volume`);
  }
}

const { envFile } = parseArgs(process.argv.slice(2));
const compose = renderCompose(envFile);

for (const serviceName of appServices) {
  assertAppHardening(serviceName, compose.services?.[serviceName] ?? {});
}

for (const [serviceName, service] of Object.entries(compose.services ?? {})) {
  assertNoUnsafeServiceConfig(serviceName, service);
  assertResources(serviceName, service);
  assertBoundedLogging(serviceName, service);
}

assertPorts(compose);
assertVolumes(compose);

console.log('Container hardening validation passed.');
