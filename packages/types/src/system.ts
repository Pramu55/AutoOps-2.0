import { z } from 'zod';

export const systemHealthcheckJobSchema = z.object({
  source: z.string().trim().min(1).max(120).default('manual-test'),
  failOnce: z.boolean().default(false),
});

export type SystemHealthcheckJobInput = z.infer<typeof systemHealthcheckJobSchema>;