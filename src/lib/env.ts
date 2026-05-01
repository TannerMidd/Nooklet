import { z } from "zod";

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("file:./data/nooklet.db"),
  AUTH_SECRET: z
    .string({ error: "AUTH_SECRET is required. Generate one with `openssl rand -base64 48`." })
    .min(32, "AUTH_SECRET must be at least 32 characters."),
  SECRET_BOX_KEY: z
    .string()
    .min(32, "SECRET_BOX_KEY must be at least 32 characters when set.")
    .optional(),
  ALLOW_PRIVATE_SERVICE_HOSTS: booleanFromEnv.default(true),
  // Maximum time to wait for an AI provider to return a recommendation batch.
  // Slow local models (LM Studio / Ollama) and large reasoning models routinely
  // exceed several minutes; recommendation runs already execute on the
  // background worker so a long ceiling is safe.
  AI_RECOMMENDATIONS_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  SECRET_BOX_KEY: process.env.SECRET_BOX_KEY,
  ALLOW_PRIVATE_SERVICE_HOSTS: process.env.ALLOW_PRIVATE_SERVICE_HOSTS,
  AI_RECOMMENDATIONS_TIMEOUT_MS: process.env.AI_RECOMMENDATIONS_TIMEOUT_MS,
});
