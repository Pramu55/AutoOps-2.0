import { createLogger } from '@autoops/logger';
import { env } from '../config/env.js';

export const logger = createLogger({
  service: 'api',
  level: env.LOG_LEVEL,
  prettyPrint: env.NODE_ENV !== 'production',
});
