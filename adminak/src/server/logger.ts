type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

function serialize(meta?: Record<string, unknown>): string {
  if (!meta) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (value instanceof Error) parts.push(`${key}=${JSON.stringify(value.message)}`);
    else if (typeof value === "string") parts.push(`${key}=${JSON.stringify(value)}`);
    else parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function createLogger(level: Level = "info", scope = "adminak", silent = false): Logger {
  const min = ORDER[level];
  const write = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    if (silent || ORDER[lvl] < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} [${scope}] ${msg}${serialize(meta)}`;
    if (lvl === "error" || lvl === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, meta) => write("debug", m, meta),
    info: (m, meta) => write("info", m, meta),
    warn: (m, meta) => write("warn", m, meta),
    error: (m, meta) => write("error", m, meta),
    child: (child) => createLogger(level, `${scope}:${child}`, silent),
  };
}
