/**
 * Lightweight Result type for service-layer code where throwing is overkill
 * (e.g., parse helpers, optional lookups). Use AppError for HTTP-bound failures.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
