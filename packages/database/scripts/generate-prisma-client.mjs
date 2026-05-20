import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const prismaCommand = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
const args = ['generate', '--schema=prisma/schema.prisma'];

const result = spawnSync(prismaCommand, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.stdout) process.stdout.write(result.stdout);

if (result.status === 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(0);
}

const output = `${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const isWindowsPrismaLock = process.platform === 'win32' && output.includes('EPERM') && output.includes('unlink');

if (isWindowsPrismaLock) {
  try {
    const clientEntry = require.resolve('@prisma/client');
    if (existsSync(clientEntry)) {
      console.warn(
        'Prisma generate hit a Windows file-lock while replacing generated client files; existing Prisma client is present, continuing release build.',
      );
      process.exit(0);
    }
  } catch {
    // Fall through to the original failure below.
  }
}

if (result.error) console.error(result.error.message);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
