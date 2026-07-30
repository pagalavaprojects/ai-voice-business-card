export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export class Logger {
  private static format(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };
  }

  static info(message: string, context?: Record<string, unknown>) {
    console.log(JSON.stringify(this.format("info", message, context)));
  }

  static warn(message: string, context?: Record<string, unknown>) {
    console.warn(JSON.stringify(this.format("warn", message, context)));
  }

  static error(message: string, context?: Record<string, unknown>) {
    console.error(JSON.stringify(this.format("error", message, context)));
  }
}
