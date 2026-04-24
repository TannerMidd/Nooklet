import { defineConfig } from "drizzle-kit";

const defaultDatabaseUrl = "./data/recommendarr.db";
const configuredUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/database/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: configuredUrl.startsWith("file:") ? configuredUrl.slice(5) : configuredUrl,
  },
});
