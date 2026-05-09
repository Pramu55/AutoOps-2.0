import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Sources = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/**
 * Strict request validator — validates body/query/params and re-assigns the parsed value.
 * Throws ZodError on failure; the error middleware translates that to a 400.
 */
export function validate<S extends Sources>(schemas: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body) as z.infer<NonNullable<S['body']>>;
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as z.infer<NonNullable<S['query']>> & typeof req.query;
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as z.infer<NonNullable<S['params']>> & typeof req.params;
    }
    next();
  };
}
