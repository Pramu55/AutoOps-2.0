export * from "./logger.js";
export * from "./errors.js";

export function formatApiResponse<T>(
  data: T,
  message?: string
): { success: true; data: T; message?: string; timestamp: string } {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}

export function formatErrorResponse(
  error: string,
  message?: string
): { success: false; error: string; message?: string; timestamp: string } {
  return {
    success: false,
    error,
    message,
    timestamp: new Date().toISOString(),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result as Omit<T, K>;
}

export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    result[key] = obj[key];
  });
  return result;
}

export function isNonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  async function attempt(retryCount: number): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retryCount >= maxRetries) throw error;
      const delay = baseDelayMs * Math.pow(2, retryCount);
      await sleep(delay);
      return attempt(retryCount + 1);
    }
  }
  return attempt(0);
}
