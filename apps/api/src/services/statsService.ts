import { prisma } from "@autoops/database";

export async function getDashboardStats() {
  const [
    activeIncidents,
    totalServices,
    servicesByStatus,
    openAlerts,
    activeWorkflows,
    recentIncidents,
  ] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.service.count(),
    prisma.service.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.alert.count({ where: { status: "ACTIVE" } }),
    prisma.workflow.count({ where: { isActive: true } }),
    prisma.incident.findMany({
      where: { status: { in: ["OPEN", "INVESTIGATING"] } },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        service: { select: { id: true, name: true } },
      },
    }),
  ]);

  const statusMap = Object.fromEntries(
    servicesByStatus.map((r) => [r.status, r._count.id])
  );

  return {
    incidents: { active: activeIncidents },
    services: {
      total: totalServices,
      operational: statusMap["OPERATIONAL"] ?? 0,
      degraded: statusMap["DEGRADED"] ?? 0,
      outage: statusMap["OUTAGE"] ?? 0,
    },
    alerts: { open: openAlerts },
    workflows: { active: activeWorkflows },
    recentIncidents,
  };
}
