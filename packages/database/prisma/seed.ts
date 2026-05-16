/**
 * Seed an initial demo organization, owner user, and one project with environments.
 * Idempotent — running it twice doesn't duplicate.
 */
import { PrismaClient, OrgRole, EnvironmentKind, ProjectVisibility } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'admin@autoops.local';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'AutoOpsAdmin1!';
const DEMO_ORG = { name: 'AutoOps Demo', slug: 'autoops-demo' };
const DEMO_PROJECT = {
  name: 'Hello AutoOps',
  slug: 'hello-autoops',
  description: 'Default seeded project to verify the platform end to end.',
};

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: 'AutoOps Admin',
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG.slug },
    update: {},
    create: DEMO_ORG,
  });

  await prisma.orgMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role: OrgRole.OWNER },
    create: { userId: user.id, organizationId: org.id, role: OrgRole.OWNER },
  });

  const project = await prisma.project.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: DEMO_PROJECT.slug } },
    update: {},
    create: {
      organizationId: org.id,
      name: DEMO_PROJECT.name,
      slug: DEMO_PROJECT.slug,
      description: DEMO_PROJECT.description,
      visibility: ProjectVisibility.ORG,
      defaultBranch: 'main',
    },
  });

  for (const kind of [EnvironmentKind.PRODUCTION, EnvironmentKind.STAGING, EnvironmentKind.DEVELOPMENT] as const) {
    await prisma.environment.upsert({
      where: { projectId_name: { projectId: project.id, name: kind.toLowerCase() } },
      update: {},
      create: {
        projectId: project.id,
        name: kind.toLowerCase(),
        slug: kind.toLowerCase(),
        kind,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('\n[seed] Done.');
  // eslint-disable-next-line no-console
  console.log(`       Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
