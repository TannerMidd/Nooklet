const sensitiveKey = /(authorization|cookie|credential|password|secret|token|api.?key)/i;
const sensitiveText = /((?:api.?key|password|secret|token)=)[^&\s]+/gi;

function sanitize(value, key = "", depth = 0) {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (depth > 4) return "[truncated]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitize(value.message, "message", depth + 1),
      code: "code" in value ? sanitize(value.code, "code", depth + 1) : undefined,
    };
  }
  if (typeof value === "string") {
    return value.slice(0, 2_000).replace(sensitiveText, "$1[redacted]");
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitize(entry, key, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).slice(0, 50).map(([field, entry]) => [field, sanitize(entry, field, depth + 1)]),
  );
}

function write(level, event, fields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.NOOKLET_PROCESS_ROLE ?? "supervisor",
    event,
    ...sanitize(fields),
  };
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method(JSON.stringify(payload));
}

export const operationalLog = {
  info(event, fields) {
    write("info", event, fields);
  },
  warn(event, fields) {
    write("warn", event, fields);
  },
  error(event, fields) {
    write("error", event, fields);
  },
};
