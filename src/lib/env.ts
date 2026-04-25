import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("file:./data/recommendarr.db"),
  AUTH_SECRET: z
    .string({ error: "AUTH_SECRET is required. Generate one with `openssl rand -base64 48`." })
    .min(32, "AUTH_SECRET must be at least 32 characters."),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
});
