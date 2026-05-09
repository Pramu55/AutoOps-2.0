import { prisma } from "./client.js";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // Users
  const hash = await bcrypt.hash("AutoOpsAdmin1!", 10);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@autoops.local" },
    update: { passwordHash: hash },
    create: { email: "admin@autoops.local", name: "Admin User", role: "ADMIN", passwordHash: hash },
  });
  const operatorUser = await prisma.user.upsert({
    where: { email: "operator@autoops.local" },
    update: {},
    create: { email: "operator@autoops.local", name: "Jane Smith", role: "OPERATOR", passwordHash: hash },
  });

  console.log("Users seeded");

  // Services
  const serviceData = [
    { name: "API Gateway", description: "Primary API gateway and load balancer", status: "OPERATIONAL" as const, url: "https://api.autoops.dev" },
    { name: "Authentication Service", description: "User auth, sessions, JWT issuance", status: "OPERATIONAL" as const },
    { name: "Worker Service", description: "Background job processing (BullMQ)", status: "OPERATIONAL" as const },
    { name: "PostgreSQL Primary", description: "Primary database cluster", status: "OPERATIONAL" as const },
    { name: "Redis Cache", description: "Caching layer and queue backend", status: "OPERATIONAL" as const },
    { name: "Notification Service", description: "Email, Slack, PagerDuty integrations", status: "DEGRADED" as const },
    { name: "CDN / Static Assets", description: "Cloudfront distribution", status: "OPERATIONAL" as const },
    { name: "Monitoring Stack", description: "Prometheus + Grafana", status: "OPERATIONAL" as const },
  ];

  const services: { id: string; name: string }[] = [];
  for (const s of serviceData) {
    const svc = await prisma.service.upsert({
      where: { name: s.name },
      update: {},
      create: s,
    });
    services.push(svc);
  }
  console.log(`Seeded ${services.length} services`);

  const svcMap = Object.fromEntries(services.map((s) => [s.name, s.id]));

  // Incidents
  const incidentData = [
    { title: "API Gateway elevated 5xx error rate", description: "Error rate spiked to 3.2% after the last deployment. Rolling back.", severity: "HIGH" as const, status: "INVESTIGATING" as const, serviceId: svcMap["API Gateway"]!, assigneeId: operatorUser.id },
    { title: "Notification Service SMTP timeout", description: "Email delivery failing due to SMTP relay timeout. Fallback to SendGrid active.", severity: "MEDIUM" as const, status: "INVESTIGATING" as const, serviceId: svcMap["Notification Service"]!, assigneeId: adminUser.id },
    { title: "PostgreSQL replica lag > 30s", description: "Read replica falling behind primary. Investigating replication slot issue.", severity: "HIGH" as const, status: "OPEN" as const, serviceId: svcMap["PostgreSQL Primary"]! },
    { title: "SSL certificate expiring in 14 days", description: "Auto-renewal failed due to DNS validation error. Manual intervention required.", severity: "LOW" as const, status: "OPEN" as const, serviceId: svcMap["API Gateway"]!, assigneeId: operatorUser.id },
    { title: "Worker queue depth spike", description: "Deployment queue backed up to 1,200 jobs. Auto-scaling triggered.", severity: "MEDIUM" as const, status: "RESOLVED" as const, serviceId: svcMap["Worker Service"]! },
    { title: "Redis memory usage at 87%", description: "Cache eviction rate increasing. TTL tuning required.", severity: "MEDIUM" as const, status: "OPEN" as const, serviceId: svcMap["Redis Cache"]! },
  ];

  for (const i of incidentData) {
    await prisma.incident.create({ data: i });
  }
  console.log(`Seeded ${incidentData.length} incidents`);

  // Alerts
  const alertData = [
    { title: "API p99 latency > 2s", message: "P99 response time exceeded 2000ms for /api/v1/incidents over the last 5 minutes.", severity: "HIGH" as const, source: "prometheus", status: "ACTIVE" as const },
    { title: "PostgreSQL replica lag alert", message: "Replication lag exceeded 30s threshold on read-replica-1.", severity: "HIGH" as const, source: "prometheus", status: "ACTIVE" as const },
    { title: "Redis memory > 85%", message: "Redis instance memory usage at 87%. OOM risk if not addressed.", severity: "MEDIUM" as const, source: "cloudwatch", status: "ACKNOWLEDGED" as const },
    { title: "Worker queue depth > 1000", message: "Deployment queue depth reached 1,247 jobs. Auto-scaling in progress.", severity: "MEDIUM" as const, source: "bullmq", status: "RESOLVED" as const },
    { title: "Certificate expiry warning", message: "TLS certificate for api.autoops.dev expires in 14 days. Renewal failing.", severity: "LOW" as const, source: "certbot", status: "ACTIVE" as const },
    { title: "Disk usage > 75% on worker-01", message: "Log volume on worker-01 at 78%. Enable log rotation.", severity: "LOW" as const, source: "node-exporter", status: "ACTIVE" as const },
  ];

  for (const a of alertData) {
    await prisma.alert.create({ data: a });
  }
  console.log(`Seeded ${alertData.length} alerts`);

  // Workflows
  const workflowData = [
    {
      name: "Incident Response",
      description: "Automated incident triage: notify on-call, create timeline entry, escalate if unacknowledged within 30 min",
      definition: {
        steps: [
          { id: "notify", type: "notification", config: { channels: ["slack", "pagerduty"], template: "incident_created" } },
          { id: "assign", type: "assignment", config: { strategy: "round-robin", team: "on-call" } },
          { id: "escalate", type: "escalation", config: { timeoutMinutes: 30, escalateTo: "manager" } },
        ],
      },
      isActive: true,
    },
    {
      name: "Service Health Check",
      description: "Polls all registered services every 5 minutes and creates alerts on degradation",
      definition: {
        steps: [
          { id: "probe", type: "http-probe", config: { timeout: 5000, failThreshold: 2 } },
          { id: "record", type: "health-record", config: { table: "health_checks" } },
          { id: "alert", type: "conditional-alert", config: { condition: "status != OPERATIONAL" } },
        ],
      },
      isActive: true,
    },
    {
      name: "Deployment Pipeline",
      description: "CI/CD webhook integration — validates, deploys, runs smoke tests, rolls back on failure",
      definition: {
        steps: [
          { id: "validate", type: "validation", config: { checks: ["schema-migration", "smoke-test-env"] } },
          { id: "deploy", type: "deployment", config: { strategy: "blue-green", timeout: 600 } },
          { id: "smoke", type: "smoke-test", config: { url: "/health", expectedStatus: 200 } },
          { id: "rollback", type: "rollback", config: { trigger: "smoke-failure", window: 300 } },
        ],
      },
      isActive: true,
    },
    {
      name: "Certificate Renewal",
      description: "Auto-renews TLS certificates via ACME/Let's Encrypt 30 days before expiry",
      definition: {
        steps: [
          { id: "check", type: "cert-check", config: { daysBeforeExpiry: 30 } },
          { id: "renew", type: "acme-renewal", config: { provider: "letsencrypt" } },
          { id: "deploy-cert", type: "cert-deploy", config: { targets: ["api-gateway", "cdn"] } },
        ],
      },
      isActive: false,
    },
  ];

  for (const w of workflowData) {
    await prisma.workflow.upsert({ where: { name: w.name }, update: {}, create: w });
  }
  console.log(`Seeded ${workflowData.length} workflows`);

  console.log("Database seeded successfully");
}

seed()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
