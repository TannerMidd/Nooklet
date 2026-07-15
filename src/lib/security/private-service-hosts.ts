import { isIP } from "node:net";

export function normalizePrivateServiceHost(value: string) {
  let normalized = value.trim().toLowerCase();

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  return normalized.replace(/\.+$/, "");
}

export function parsePrivateServiceHostAllowlist(value: string) {
  return value
    .split(/[;\r\n]+/)
    .map(normalizePrivateServiceHost)
    .filter(Boolean);
}

export function isValidPrivateServiceHost(value: string) {
  const normalized = normalizePrivateServiceHost(value);
  if (!normalized || normalized.length > 253) return false;
  if (isIP(normalized) !== 0) return true;

  return normalized.split(".").every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

export function isPrivateServiceHostAllowlisted(hostname: string, configuredHosts: string) {
  const normalizedHostname = normalizePrivateServiceHost(hostname);
  return parsePrivateServiceHostAllowlist(configuredHosts).includes(normalizedHostname);
}
