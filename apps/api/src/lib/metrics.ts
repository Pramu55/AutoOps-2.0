import client from 'prom-client';

export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'autoops-api' });
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const deploymentsTotal = new client.Counter({
  name: 'autoops_deployments_total',
  help: 'Number of deployments triggered',
  labelNames: ['status', 'project'] as const,
  registers: [registry],
});

export const wsConnections = new client.Gauge({
  name: 'autoops_ws_connections',
  help: 'Active websocket connections',
  registers: [registry],
});
