import { prisma } from "@autoops/database";
import { Prisma } from "@prisma/client";
import type { CreateWorkflowDto } from "@autoops/shared";
import { NotFoundError, ConflictError } from "@autoops/shared";

export async function getWorkflows(options: {
  page: number;
  pageSize: number;
  isActive?: boolean;
}) {
  const { page, pageSize, isActive } = options;
  const skip = (page - 1) * pageSize;

  const where = { ...(isActive !== undefined && { isActive }) };

  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        _count: { select: { runs: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.workflow.count({ where }),
  ]);

  return {
    workflows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getWorkflowById(id: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: { select: { runs: true } },
    },
  });

  if (!workflow) {
    throw new NotFoundError("Workflow", id);
  }

  return workflow;
}

export async function createWorkflow(data: CreateWorkflowDto) {
  const existing = await prisma.workflow.findUnique({
    where: { name: data.name },
  });

  if (existing) {
    throw new ConflictError(`Workflow with name '${data.name}' already exists`);
  }

  return prisma.workflow.create({
    data: {
      name: data.name,
      description: data.description,
      definition: data.definition as Prisma.InputJsonValue,
      isActive: data.isActive ?? true,
    },
  });
}

export async function triggerWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  userId?: string
) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) {
    throw new NotFoundError("Workflow", workflowId);
  }

  if (!workflow.isActive) {
    throw new ConflictError(`Workflow '${workflow.name}' is not active`);
  }

  return prisma.workflowRun.create({
    data: {
      workflowId,
      userId,
      status: "PENDING",
      input: input as Prisma.InputJsonValue,
    },
    include: {
      workflow: { select: { id: true, name: true } },
    },
  });
}

export async function getWorkflowRuns(workflowId: string, options: {
  page: number;
  pageSize: number;
}) {
  const { page, pageSize } = options;
  const skip = (page - 1) * pageSize;

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    throw new NotFoundError("Workflow", workflowId);
  }

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where: { workflowId },
      skip,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workflowRun.count({ where: { workflowId } }),
  ]);

  return {
    runs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
