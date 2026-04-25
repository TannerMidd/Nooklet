// Provide a deterministic AUTH_SECRET for tests so the env schema validates.
// This value is only used during Vitest runs and never reaches a real environment.
process.env.AUTH_SECRET ??= "test-auth-secret-must-be-at-least-32-chars-long";
if (!process.env.NODE_ENV) {
  (process.env as Record<string, string>).NODE_ENV = "test";
}
