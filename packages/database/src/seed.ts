import { prisma } from "./client.js";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "AutoOpsAdmin1!";
const BCRYPT_ROUNDS = 10;

async function seed() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@autoops.local" },
    update: { passwordHash, name: "Admin User", role: "ADMIN" },
    create: {
      email: "admin@autoops.local",
      name: "Admin User",
      role: "ADMIN",
      passwordHash,
    },
  });

  console.log(`Upserted admin: ${adminUser.email}`);

  await prisma.user.upsert({
    where: { email: "admin@autoops.dev" },
    update: { passwordHash },
    create: {
      email: "admin@autoops.dev",
      name: "Admin (dev)",
      role: "ADMIN",
      passwordHash,
    },
  });

  const serviceNames = ["API Gateway", "Authentication Service", "Worker Service"];
  for (const name of serviceNames) {
    await prisma.service.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} — monitored by AutoOps`, status: "OPERATIONAL" },
    });
  }

  console.log(`Upserted ${serviceNames.length} services`);

  await prisma.workflow.upsert({
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

  console.log("Database seeded successfully");
}

seed()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
