import { z } from "zod";

import {
    isValidPrivateServiceHost,
    parsePrivateServiceHostAllowlist,
} from "@/lib/security/private-service-hosts";

const booleanFromEnv = z
    .preprocess(
        (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
        z.union([z.boolean(), z.enum(["1", "0", "true", "false", "yes", "no", "on", "off"])]),
    )
    .transform((value) => {
        if (typeof value === "boolean") {
            return value;
        }

        return ["1", "true", "yes", "on"].includes(value);
    });

const secretMaterialSchema = z
    .string()
    .max(512)
    .refine(
        (value) => value.trim().length >= 32,
        "Secret values must contain at least 32 non-whitespace characters.",
    );

const optionalSecretFromEnv = z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    secretMaterialSchema.optional(),
);

const appUrlFromEnv = z
    .string()
    .url()
    .superRefine((value, context) => {
        const url = new URL(value);

        if (!new Set(["http:", "https:"]).has(url.protocol)) {
            context.addIssue({
                code: "custom",
                message: "APP_URL must use http or https.",
            });
        }

        if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
            context.addIssue({
                code: "custom",
                message:
                    "APP_URL must be an origin only, without credentials, a path, query, or fragment.",
            });
        }
    });

const databaseUrlFromEnv = z
    .string()
    .min(6, "DATABASE_URL must identify a SQLite file.")
    .max(4096)
    .regex(/^file:.+/i, "DATABASE_URL must use the file: SQLite URL format.")
    .refine((value) => !value.includes("\0"), "DATABASE_URL cannot contain null bytes.");

const filesystemPathFromEnv = z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => !value.includes("\0"), "Filesystem paths cannot contain null bytes.");

const optionalFilesystemPathFromEnv = z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    filesystemPathFromEnv.optional(),
);

const optionalHttpOriginFromEnv = z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    appUrlFromEnv.optional(),
);

const optionalListFromEnv = z
    .string()
    .max(32_768)
    .refine((value) => !value.includes("\0"), "Environment lists cannot contain null bytes.");

const knownPlaceholderSecrets = new Set([
    "replace-with-a-long-random-string",
    "replace-with-a-long-random-bootstrap-token",
    "change-me",
]);

const envShape = {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: appUrlFromEnv.default("http://localhost:42021"),
    DATABASE_URL: databaseUrlFromEnv.default("file:./data/nooklet.db"),
    AUTH_SECRET: z
        .string({ error: "AUTH_SECRET is required. Generate one with `openssl rand -base64 48`." })
        .max(512)
        .refine(
            (value) => value.trim().length >= 32,
            "AUTH_SECRET must contain at least 32 non-whitespace characters.",
        ),
    SECRET_BOX_KEY: optionalSecretFromEnv,
    SECRET_BOX_PREVIOUS_KEYS: optionalListFromEnv.default(""),
    BOOTSTRAP_TOKEN: optionalSecretFromEnv,
    APPROVED_MEDIA_ROOTS: optionalListFromEnv.default(""),
    TRUST_PROXY_HEADERS: booleanFromEnv.default(false),
    PRIVATE_SERVICE_HOST_ALLOWLIST: optionalListFromEnv.default(""),
    ALLOW_PRIVATE_SERVICE_HOSTS: booleanFromEnv.default(false),
    // Output directory for the built-in usenet download engine (ADR-0002).
    // Completed downloads land here; it may live on a host bind mount.
    DOWNLOAD_ENGINE_DIR: filesystemPathFromEnv.default("./data/downloads"),
    // Scratch directory where in-flight downloads assemble, repair, and
    // extract. This I/O is many parallel random-offset writes plus tool-driven
    // rewrites, which wedges Docker Desktop's gRPC-FUSE/9p file sharing when it
    // targets a Windows bind mount — so it defaults into the data volume
    // (Linux-native filesystem) and only the finalized output crosses onto
    // DOWNLOAD_ENGINE_DIR with a single sequential copy.
    DOWNLOAD_ENGINE_WORK_DIR: filesystemPathFromEnv.default("./data/engine-work"),
    // YouTube tooling is bundled in Docker and may be overridden for native installs.
    // All transfer state stays under this persistent work directory until a final,
    // containment-checked import into an attached YouTube library root.
    YT_DLP_PATH: filesystemPathFromEnv.default("yt-dlp"),
    FFMPEG_PATH: filesystemPathFromEnv.default("ffmpeg"),
    YOUTUBE_WORK_DIR: filesystemPathFromEnv.default("./data/youtube"),
    YT_DLP_PLUGIN_DIR: optionalFilesystemPathFromEnv,
    YOUTUBE_POT_PROVIDER_URL: optionalHttpOriginFromEnv,
    // Maximum time to wait for an AI provider to return a recommendation batch.
    // Slow local models (LM Studio / Ollama) and large reasoning models routinely
    // exceed several minutes; recommendation runs already execute on the
    // background worker so a long ceiling is safe.
    AI_RECOMMENDATIONS_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .max(24 * 60 * 60_000, "AI_RECOMMENDATIONS_TIMEOUT_MS cannot exceed 24 hours.")
        .default(30 * 60_000),
    // Retain operational/audit records long enough for incident review while
    // preventing maintenance tables from growing without bound.
    OPERATIONAL_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
} satisfies z.ZodRawShape;

export const runtimeEnvKeys = Object.keys(envShape) as Array<keyof typeof envShape>;

export const envSchema = z.object(envShape).superRefine((value, context) => {
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

    const activeSecrets = [
        ["AUTH_SECRET", value.AUTH_SECRET],
        ["SECRET_BOX_KEY", value.SECRET_BOX_KEY],
        ["BOOTSTRAP_TOKEN", value.BOOTSTRAP_TOKEN],
    ] as const;

    for (let leftIndex = 0; leftIndex < activeSecrets.length; leftIndex += 1) {
        const [leftField, leftSecret] = activeSecrets[leftIndex];

        if (!leftSecret) {
            continue;
        }

        for (let rightIndex = leftIndex + 1; rightIndex < activeSecrets.length; rightIndex += 1) {
            const [rightField, rightSecret] = activeSecrets[rightIndex];

            if (!rightSecret || leftSecret !== rightSecret) {
                continue;
            }

            context.addIssue({
                code: "custom",
                path: [rightField],
                message: `${rightField} must be generated independently and cannot equal ${leftField}.`,
            });
        }
    }

    const previousKeys = value.SECRET_BOX_PREVIOUS_KEYS.split(/[;\r\n]+/)
        .map((key) => key.trim())
        .filter(Boolean);

    for (const key of previousKeys) {
        if (key.length < 32 || key.length > 512 || knownPlaceholderSecrets.has(key.toLowerCase())) {
            context.addIssue({
                code: "custom",
                path: ["SECRET_BOX_PREVIOUS_KEYS"],
                message:
                    "Each previous encryption key must be a non-placeholder value between 32 and 512 characters.",
            });
            break;
        }
    }

    for (const host of parsePrivateServiceHostAllowlist(value.PRIVATE_SERVICE_HOST_ALLOWLIST)) {
        if (!isValidPrivateServiceHost(host)) {
            context.addIssue({
                code: "custom",
                path: ["PRIVATE_SERVICE_HOST_ALLOWLIST"],
                message:
                    "Private service hosts must be exact hostnames or IP addresses without schemes, paths, ports, or wildcards.",
            });
            break;
        }
    }
});

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env) {
    return envSchema.parse(Object.fromEntries(runtimeEnvKeys.map((key) => [key, source[key]])));
}

export const env = parseEnvironment();
