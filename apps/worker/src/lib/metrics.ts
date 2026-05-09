import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'worker_' });

// ── Job counters ─────────────────────────────────────────────────────────────

export const jobsProcessedTotal = new Counter({
  name: 'worker_jobs_processed_total',
  help: 'Total number of jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [registry],
});

export const jobDurationSeconds = new Histogram({
  name: 'worker_job_duration_seconds',
  help: 'Job processing duration in seconds',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

// ── Queue depth ───────────────────────────────────────────────────────────────

export const queueDepth = new Gauge({
  name: 'worker_queue_depth',
  help: 'Number of waiting jobs per queue',
  labelNames: ['queue'] as const,
  registers: [registry],
});

// ── Deployment metrics ────────────────────────────────────────────────────────

export const deploymentsTotal = new Counter({
  name: 'worker_deployments_total',
  help: 'Total deployments attempted by the worker',
  labelNames: ['status', 'environment'] as const,
  registers: [registry],
});
