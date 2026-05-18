/**
 * Seed an initial demo organization, owner user, and one project with environments.
 * Idempotent — running it twice doesn't duplicate.
 */
import { PrismaClient, OrgRole, EnvironmentKind, ProjectVisibility } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'StrongPass123';
const DEMO_ORG = { name: 'AutoOps Demo', slug: 'autoops-demo' };
const DEMO_PROJECT = {
  name: 'Hello AutoOps',
  slug: 'hello-autoops',
  description: 'Default seeded project to verify the platform end to end.',
};
const OPERATOR_USER = {
  email: process.env.SEED_EMAIL ?? 'pramod.local@autoops.dev',
  name: 'Pramod S S',
  role: OrgRole.OWNER,
} as const;
const APPROVER_USER = {
  email: process.env.SEED_APPROVER_EMAIL ?? 'approver.local@autoops.dev',
  name: 'AutoOps Approver',
  role: OrgRole.ADMIN,
} as const;
const DEMO_MEMBERSHIP_JOINED_AT = new Date('2000-01-01T00:00:00.000Z');

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const operator = await prisma.user.upsert({
    where: { email: OPERATOR_USER.email },
    update: {
      name: OPERATOR_USER.name,
      passwordHash,
      emailVerified: new Date(),
      isActive: true,
    },
    create: {
      email: OPERATOR_USER.email,
      name: OPERATOR_USER.name,
      passwordHash,
      emailVerified: new Date(),
    },
    include: {
      memberships: {
        orderBy: { joinedAt: 'asc' },
        include: { organization: true },
      },
    },
  });

  let org = operator.memberships[0]?.organization;

  if (!org) {
    org = await prisma.organization.upsert({
      where: { slug: DEMO_ORG.slug },
      update: {},
      create: DEMO_ORG,
    });

    await prisma.orgMembership.upsert({
      where: { userId_organizationId: { userId: operator.id, organizationId: org.id } },
      update: { role: OPERATOR_USER.role },
      create: {
        userId: operator.id,
        organizationId: org.id,
        role: OPERATOR_USER.role,
        joinedAt: DEMO_MEMBERSHIP_JOINED_AT,
      },
    });
  }

  const approver = await prisma.user.upsert({
    where: { email: APPROVER_USER.email },
    update: {
      name: APPROVER_USER.name,
      passwordHash,
      emailVerified: new Date(),
      isActive: true,
    },
    create: {
      email: APPROVER_USER.email,
      name: APPROVER_USER.name,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_organizationId: { userId: approver.id, organizationId: org.id } },
    update: {
      role: APPROVER_USER.role,
      joinedAt: DEMO_MEMBERSHIP_JOINED_AT,
    },
    create: {
      userId: approver.id,
      organizationId: org.id,
      role: APPROVER_USER.role,
      joinedAt: DEMO_MEMBERSHIP_JOINED_AT,
    },
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
  console.log(`       ${OPERATOR_USER.role}: ${OPERATOR_USER.email} / ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`       ${APPROVER_USER.role}: ${APPROVER_USER.email} / ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log('');
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
