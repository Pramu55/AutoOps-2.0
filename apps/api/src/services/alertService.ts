import { prisma } from "@autoops/database";
import { Prisma, type AlertStatus, type Severity } from "@prisma/client";
import type { CreateAlertDto } from "@autoops/shared";
import { NotFoundError } from "@autoops/shared";

export async function getAlerts(options: {
  page: number;
  pageSize: number;
  status?: string;
  severity?: string;
  source?: string;
}) {
  const { page, pageSize, status, severity, source } = options;
  const skip = (page - 1) * pageSize;

  const where = {
    ...(status && { status: status as AlertStatus }),
    ...(severity && { severity: severity as Severity }),
    ...(source && { source }),
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    alerts,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getAlertById(id: string) {
  const alert = await prisma.alert.findUnique({ where: { id } });

  if (!alert) {
    throw new NotFoundError("Alert", id);
  }

  return alert;
}

export async function createAlert(data: CreateAlertDto) {
  return prisma.alert.create({
    data: {
      title: data.title,
      message: data.message,
      severity: data.severity as Severity,
      source: data.source,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
      status: "ACTIVE",
    },
  });
}

export async function acknowledgeAlert(id: string) {
  const existing = await prisma.alert.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Alert", id);
  }

  return prisma.alert.update({
    where: { id },
    data: { status: "ACKNOWLEDGED" },
  });
}

export async function resolveAlert(id: string) {
  const existing = await prisma.alert.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Alert", id);
  }

  return prisma.alert.update({
    where: { id },
    data: { status: "RESOLVED" },
  });
}
