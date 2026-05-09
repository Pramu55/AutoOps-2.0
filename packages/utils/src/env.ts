import { z, type ZodTypeAny, type ZodError } from 'zod';

/**
 * Type-safe environment loader.
 *
 *   const env = loadEnv(z.object({ PORT: z.coerce.number().default(4000) }));
 *
 * Throws a single readable error on validation failure — no per-key surprises at runtime.
 */
export function loadEnv<S extends ZodTypeAny>(schema: S): z.infer<S> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = formatZodEnvError(parsed.error);
    // eslint-disable-next-line no-console
    console.error('\n[env] Invalid environment configuration:\n' + formatted + '\n');
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}

function formatZodEnvError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}
