import { prisma } from "@autoops/database";
import type {
  CreateIncidentDto,
  UpdateIncidentDto,
} from "@autoops/shared";
import { NotFoundError, ConflictError } from "@autoops/shared";

export async function getIncidents(options: {
  page: number;
  pageSize: number;
  status?: string;
  severity?: string;
  serviceId?: string;
}) {
  const { page, pageSize, status, severity, serviceId } = options;
  const skip = (page - 1) * pageSize;

  const where = {
    ...(status && { status: status as never }),
    ...(severity && { severity: severity as never }),
    ...(serviceId && { serviceId }),
  };

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        service: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.incident.count({ where }),
  ]);

  return {
    incidents,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getIncidentById(id: string) {
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, status: true } },
      timeline: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!incident) {
    throw new NotFoundError("Incident", id);
  }

  return incident;
}

export async function createIncident(data: CreateIncidentDto) {
  const service = await prisma.service.findUnique({
    where: { id: data.serviceId },
  });

  if (!service) {
    throw new NotFoundError("Service", data.serviceId);
  }

  return prisma.incident.create({
    data: {
      title: data.title,
      description: data.description,
      severity: data.severity as never,
      serviceId: data.serviceId,
      assigneeId: data.assigneeId,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, status: true } },
    },
  });
}

export async function updateIncident(id: string, data: UpdateIncidentDto) {
  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Incident", id);
  }

  const resolvedAt =
    data.status === "RESOLVED" && existing.status !== "RESOLVED"
      ? new Date()
      : undefined;

  return prisma.incident.update({
    where: { id },
    data: {
      ...data,
      ...(resolvedAt && { resolvedAt }),
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, status: true } },
    },
  });
}

export async function deleteIncident(id: string) {
  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Incident", id);
  }

  await prisma.incident.delete({ where: { id } });
}
