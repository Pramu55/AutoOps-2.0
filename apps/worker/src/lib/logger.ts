import { createLogger as sharedCreateLogger } from "@autoops/shared";

export interface CreateLoggerOptions {
  prefix?: string;
  level?: "debug" | "info" | "warn" | "error";
  pretty?: boolean;
}

export function createLogger(prefixOrOptions: string | CreateLoggerOptions) {
  return sharedCreateLogger(prefixOrOptions);
}

export { logger } from "@autoops/shared";
