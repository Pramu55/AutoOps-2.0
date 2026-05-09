export { prisma } from "./client.js";
// `db` is an alias for `prisma` — both names are valid throughout the monorepo.
// This prevents naming-convention drift between packages that use one vs the other.
export { prisma as db } from "./client.js";
export type { PrismaClient } from "./client.js";
export * from "@prisma/client";
