export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

function formatLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
  };
}

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const entry = formatLog(level, message, context);
  const output = JSON.stringify(entry);

  if (level === "error" || level === "warn") {
    console.error(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log("error", message, context),
};

export function createLogger(prefix: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      log("debug", `[${prefix}] ${message}`, context),
    info: (message: string, context?: Record<string, unknown>) =>
      log("info", `[${prefix}] ${message}`, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      log("warn", `[${prefix}] ${message}`, context),
    error: (message: string, context?: Record<string, unknown>) =>
      log("error", `[${prefix}] ${message}`, context),
  };
}
