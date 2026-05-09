import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@autoops/shared";

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = (result.error as z.ZodError).errors
        .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      next(new ValidationError(message));
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = (result.error as z.ZodError).errors
        .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      next(new ValidationError(message));
      return;
    }
    next();
  };
}

export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => parseInt(v ?? "1", 10))
    .pipe(z.number().min(1)),
  pageSize: z
    .string()
    .optional()
    .transform((v) => parseInt(v ?? "20", 10))
    .pipe(z.number().min(1).max(100)),
});
