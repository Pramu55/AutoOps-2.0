import { createLogger } from '@autoops/logger';
import { env } from '../config/env.js';

export const logger = createLogger({
  service: 'autoops-worker',
  level: env.LOG_LEVEL,
  prettyPrint: !['production', 'test'].includes(env.NODE_ENV),
});
