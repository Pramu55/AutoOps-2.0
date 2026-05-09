import { prisma } from "@autoops/database";
import { type ServiceStatus } from "@prisma/client";
import type { CreateServiceDto, UpdateServiceDto } from "@autoops/shared";
import { NotFoundError, ConflictError } from "@autoops/shared";

export async function getServices(options: {
  page: number;
  pageSize: number;
  status?: string;
}) {
  const { page, pageSize, status } = options;
  const skip = (page - 1) * pageSize;

  const where = { ...(status && { status: status as ServiceStatus }) };

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        _count: { select: { incidents: { where: { status: { in: ["OPEN", "INVESTIGATING"] } } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.count({ where }),
  ]);

  return {
    services,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getServiceById(id: string) {
  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      incidents: {
        where: { status: { in: ["OPEN", "INVESTIGATING"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { incidents: true } },
    },
  });

  if (!service) {
    throw new NotFoundError("Service", id);
  }

  return service;
}

export async function createService(data: CreateServiceDto) {
  const existing = await prisma.service.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new ConflictError(`Service with name '${data.name}' already exists`);
  }

  return prisma.service.create({
    data: {
      name: data.name,
      description: data.description,
      status: (data.status as ServiceStatus) ?? "OPERATIONAL",
    },
  });
}

export async function updateService(id: string, data: UpdateServiceDto) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Service", id);
  }

  if (data.name && data.name !== existing.name) {
    const nameConflict = await prisma.service.findUnique({
      where: { name: data.name },
    });
    if (nameConflict) {
      throw new ConflictError(`Service with name '${data.name}' already exists`);
    }
  }

  return prisma.service.update({
    where: { id },
    data: { ...data },
  });
}

export async function deleteService(id: string) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Service", id);
  }

  const activeIncidents = await prisma.incident.count({
    where: { serviceId: id, status: { in: ["OPEN", "INVESTIGATING"] } },
  });

  if (activeIncidents > 0) {
    throw new ConflictError(
      `Cannot delete service with ${activeIncidents} active incident(s)`
    );
  }

  await prisma.service.delete({ where: { id } });
}
