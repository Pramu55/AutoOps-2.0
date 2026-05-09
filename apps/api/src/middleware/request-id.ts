import type { Request, Response, NextFunction } from 'express';
import { newId } from '@autoops/utils';
import { withRequestContext } from '@autoops/logger';
import { logger } from '../lib/logger.js';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,128}$/.test(incoming) ? incoming : newId();
  req.id = requestId;
  req.log = withRequestContext(logger, { requestId });
  res.setHeader('x-request-id', requestId);
  next();
}
