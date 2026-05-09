import { prisma } from "./client.js";

async function seed() {
  console.log("Seeding database...");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@autoops.dev" },
    update: {},
    create: {
      email: "admin@autoops.dev",
      name: "Admin User",
      role: "ADMIN",
    },
  });

  console.log(`Created admin user: ${adminUser.email}`);

  const services = await Promise.all([
    prisma.service.upsert({
      where: { name: "API Gateway" },
      update: {},
      create: {
        name: "API Gateway",
        description: "Main API gateway service",
        status: "OPERATIONAL",
        url: "https://api.autoops.dev",
      },
    }),
    prisma.service.upsert({
      where: { name: "Authentication Service" },
      update: {},
      create: {
        name: "Authentication Service",
        description: "User authentication and authorization",
        status: "OPERATIONAL",
      },
    }),
    prisma.service.upsert({
      where: { name: "Worker Service" },
      update: {},
      create: {
        name: "Worker Service",
        description: "Background job processing",
        status: "OPERATIONAL",
      },
    }),
  ]);

  console.log(`Created ${services.length} services`);

  const workflow = await prisma.workflow.upsert({
    where: { name: "Incident Response" },
    update: {},
    create: {
      name: "Incident Response",
      description: "Automated incident response workflow",
      definition: {
        steps: [
          { id: "notify", type: "notification", config: { channel: "slack" } },
          { id: "assign", type: "assignment", config: { strategy: "round-robin" } },
          { id: "escalate", type: "escalation", config: { timeoutMinutes: 30 } },
        ],
      },
      isActive: true,
    },
  });

  console.log(`Created workflow: ${workflow.name}`);
  console.log("Database seeded successfully");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
