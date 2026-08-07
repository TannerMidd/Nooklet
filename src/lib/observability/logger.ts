type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const sensitiveFieldPattern = /(authorization|cookie|credential|password|secret|token|api.?key)/i;
const sensitiveTextPattern = /((?:api.?key|password|secret|token)=)[^&\s]+/gi;
const maxStringLength = 2_000;

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveFieldPattern.test(key)) return "[redacted]";
  if (depth > 4) return "[truncated]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitize(value.message, "message", depth + 1),
      code: "code" in value ? sanitize(value.code, "code", depth + 1) : undefined,
    };
  }

  if (typeof value === "string") {
    return value.slice(0, maxStringLength).replace(sensitiveTextPattern, "$1[redacted]");
  }

  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitize(entry, key, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([field, entry]) => [field, sanitize(entry, field, depth + 1)]),
  );
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const sanitizedFields = sanitize(fields) as LogFields;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.NOOKLET_PROCESS_ROLE ?? "web",
    event,
    ...sanitizedFields,
  };

  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (process.env.NODE_ENV === "production") {
    method(JSON.stringify(payload));
    return;
  }

  method(`[${event}]`, sanitizedFields);
}

export const logger = {
  info(event: string, fields?: LogFields) {
    write("info", event, fields);
  },
  warn(event: string, fields?: LogFields) {
    write("warn", event, fields);
  },
  error(event: string, fields?: LogFields) {
    write("error", event, fields);
  },
};
