export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

/**
 * Exponential backoff with full jitter. Defaults: 5 retries, 100ms base, 5s cap.
 */
export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 5, baseMs = 100, maxMs = 5000, factor = 2, jitter = true, shouldRetry } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || (shouldRetry && !shouldRetry(err, attempt))) {
        break;
      }
      const exp = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
      const delay = jitter ? Math.floor(Math.random() * exp) : exp;
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Hard timeout — rejects if the inner promise hasn't settled within `ms`.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
