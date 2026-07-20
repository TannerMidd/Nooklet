import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database/client", () => ({ ensureDatabaseReady: vi.fn() }));

import { ensureDatabaseReady } from "@/lib/database/client";

import { register } from "./instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Next.js instrumentation bootstrap", () => {
  it("initializes only the database in the production web process", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await register();

    expect(ensureDatabaseReady).toHaveBeenCalledTimes(1);
  });

  it("keeps local development instrumentation web-only", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await register();

    expect(ensureDatabaseReady).toHaveBeenCalledTimes(1);
  });

  it("keeps a supervised web process isolated even if its environment says development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOOKLET_PROCESS_ROLE", "web");

    await register();

    expect(ensureDatabaseReady).toHaveBeenCalledTimes(1);
  });

  it("does nothing in an edge runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(ensureDatabaseReady).not.toHaveBeenCalled();
  });
});
