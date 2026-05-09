import type { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../lib/metrics.js';

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durSec = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestDuration.observe(labels, durSec);
    httpRequestsTotal.inc(labels);
    req.log.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durMs: Math.round(durSec * 1000),
      },
      'request',
    );
  });
  next();
}
