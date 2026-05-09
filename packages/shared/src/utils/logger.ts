export type LogLevel = "debug" | "info" | "warn" | "error";

// CreateLoggerOptions supports both the simple string prefix pattern
// and the options-object pattern used in more complex services.
export interface CreateLoggerOptions {
  prefix?: string;
  level?: LogLevel;
  // pretty: true → human-readable output for dev; false → JSON for production log aggregation
  pretty?: boolean;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI colour codes — only used when pretty=true
const COLOURS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info:  "\x1b[32m", // green
  warn:  "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function formatPretty(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const colour = COLOURS[level];
  const ctx = context && Object.keys(context).length > 0
    ? "\n  " + JSON.stringify(context, null, 2).replace(/\n/g, "\n  ")
    : "";
  return `${colour}${ts} [${level.toUpperCase()}]${RESET} ${message}${ctx}`;
}

function formatJson(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: LogEntry = { level, message, timestamp: new Date().toISOString() };
  if (context && Object.keys(context).length > 0) entry.context = context;
  return JSON.stringify(entry);
}

function emit(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> | undefined,
  minLevel: LogLevel,
  pretty: boolean
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

  const line = pretty
    ? formatPretty(level, message, context)
    : formatJson(level, message, context);

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// Build a logger instance from options
function buildLogger(opts: { prefix?: string; level?: LogLevel; pretty?: boolean }) {
  const prefix = opts.prefix ?? "";
  const minLevel: LogLevel = opts.level ?? "debug";
  const pretty = opts.pretty ?? (process.env["NODE_ENV"] === "development");
  const tag = prefix ? `[${prefix}] ` : "";

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", `${tag}${msg}`, ctx, minLevel, pretty),
    info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  `${tag}${msg}`, ctx, minLevel, pretty),
    warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  `${tag}${msg}`, ctx, minLevel, pretty),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("error", `${tag}${msg}`, ctx, minLevel, pretty),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export const logger = buildLogger({});

/**
 * createLogger("API")               → prefixed logger with default options
 * createLogger({ prefix: "API", pretty: true, level: "info" })  → with options
 */
export function createLogger(prefixOrOptions: string | CreateLoggerOptions) {
  if (typeof prefixOrOptions === "string") {
    return buildLogger({ prefix: prefixOrOptions });
  }
  return buildLogger(prefixOrOptions);
}
