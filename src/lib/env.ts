import { z } from "zod";

import {
  isValidPrivateServiceHost,
  parsePrivateServiceHostAllowlist,
} from "@/lib/security/private-service-hosts";

const booleanFromEnv = z
  .preprocess(
    (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
    z.union([z.boolean(), z.enum(["1", "0", "true", "false", "yes", "no", "on", "off"])]),
  )
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "on"].includes(value);
  });

const optionalSecretFromEnv = z.preprocess(
  (value) => typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().min(32).max(512).optional(),
);

const knownPlaceholderSecrets = new Set([
  "replace-with-a-long-random-string",
  "replace-with-a-long-random-bootstrap-token",
  "change-me",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:42021"),
  DATABASE_URL: z.string().min(1).default("file:./data/nooklet.db"),
  AUTH_SECRET: z
    .string({ error: "AUTH_SECRET is required. Generate one with `openssl rand -base64 48`." })
    .min(32, "AUTH_SECRET must be at least 32 characters."),
  SECRET_BOX_KEY: optionalSecretFromEnv,
  SECRET_BOX_PREVIOUS_KEYS: z.string().default(""),
  BOOTSTRAP_TOKEN: optionalSecretFromEnv,
  APPROVED_MEDIA_ROOTS: z.string().default(""),
  APPROVED_DOWNLOAD_ROOTS: z.string().default(""),
  TRUST_PROXY_HEADERS: booleanFromEnv.default(false),
  PRIVATE_SERVICE_HOST_ALLOWLIST: z.string().default(""),
  ALLOW_PRIVATE_SERVICE_HOSTS: booleanFromEnv.default(false),
  SABNZBD_PATH_MAPPINGS: z.string().default(""),
  // Output directory for the built-in usenet download engine (ADR-0002).
  // Completed downloads land here; it may live on a host bind mount.
  DOWNLOAD_ENGINE_DIR: z.string().default("./data/downloads"),
  // Scratch directory where in-flight downloads assemble, repair, and
  // extract. This I/O is many parallel random-offset writes plus tool-driven
  // rewrites, which wedges Docker Desktop's gRPC-FUSE/9p file sharing when it
  // targets a Windows bind mount — so it defaults into the data volume
  // (Linux-native filesystem) and only the finalized output crosses onto
  // DOWNLOAD_ENGINE_DIR with a single sequential copy.
  DOWNLOAD_ENGINE_WORK_DIR: z.string().default("./data/engine-work"),
  // Maximum time to wait for an AI provider to return a recommendation batch.
  // Slow local models (LM Studio / Ollama) and large reasoning models routinely
  // exceed several minutes; recommendation runs already execute on the
  // background worker so a long ceiling is safe.
  AI_RECOMMENDATIONS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
}).superRefine((value, context) => {
  for (const [field, secret] of [
    ["AUTH_SECRET", value.AUTH_SECRET],
    ["SECRET_BOX_KEY", value.SECRET_BOX_KEY],
    ["BOOTSTRAP_TOKEN", value.BOOTSTRAP_TOKEN],
  ] as const) {
    if (secret && knownPlaceholderSecrets.has(secret.trim().toLowerCase())) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `${field} is still set to a known placeholder. Generate a unique random value.`,
      });
    }
  }

  const previousKeys = value.SECRET_BOX_PREVIOUS_KEYS
    .split(/[;\r\n]+/)
    .map((key) => key.trim())
    .filter(Boolean);

  for (const key of previousKeys) {
    if (key.length < 32 || key.length > 512 || knownPlaceholderSecrets.has(key.toLowerCase())) {
      context.addIssue({
        code: "custom",
        path: ["SECRET_BOX_PREVIOUS_KEYS"],
        message: "Each previous encryption key must be a non-placeholder value between 32 and 512 characters.",
      });
      break;
    }
  }

  for (const host of parsePrivateServiceHostAllowlist(value.PRIVATE_SERVICE_HOST_ALLOWLIST)) {
    if (!isValidPrivateServiceHost(host)) {
      context.addIssue({
        code: "custom",
        path: ["PRIVATE_SERVICE_HOST_ALLOWLIST"],
        message: "Private service hosts must be exact hostnames or IP addresses without schemes, paths, ports, or wildcards.",
      });
      break;
    }
  }
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  SECRET_BOX_KEY: process.env.SECRET_BOX_KEY,
  SECRET_BOX_PREVIOUS_KEYS: process.env.SECRET_BOX_PREVIOUS_KEYS,
  BOOTSTRAP_TOKEN: process.env.BOOTSTRAP_TOKEN,
  APPROVED_MEDIA_ROOTS: process.env.APPROVED_MEDIA_ROOTS,
  APPROVED_DOWNLOAD_ROOTS: process.env.APPROVED_DOWNLOAD_ROOTS,
  TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  PRIVATE_SERVICE_HOST_ALLOWLIST: process.env.PRIVATE_SERVICE_HOST_ALLOWLIST,
  ALLOW_PRIVATE_SERVICE_HOSTS: process.env.ALLOW_PRIVATE_SERVICE_HOSTS,
  SABNZBD_PATH_MAPPINGS: process.env.SABNZBD_PATH_MAPPINGS,
  DOWNLOAD_ENGINE_DIR: process.env.DOWNLOAD_ENGINE_DIR,
  DOWNLOAD_ENGINE_WORK_DIR: process.env.DOWNLOAD_ENGINE_WORK_DIR,
  AI_RECOMMENDATIONS_TIMEOUT_MS: process.env.AI_RECOMMENDATIONS_TIMEOUT_MS,
});
