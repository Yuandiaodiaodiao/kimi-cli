/**
 * Logging module — corresponds to Python utils/logging.py
 * Simple structured logger using console with level filtering.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = "info";

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) console.debug(`[DEBUG] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) console.info(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) console.error(`[ERROR] ${message}`, ...args);
  }
}

export const logger = new Logger();

// Set default level from environment
if (process.env.KIMI_LOG_LEVEL) {
  const envLevel = process.env.KIMI_LOG_LEVEL.toLowerCase() as LogLevel;
  if (envLevel in LOG_LEVELS) {
    logger.setLevel(envLevel);
  }
}
