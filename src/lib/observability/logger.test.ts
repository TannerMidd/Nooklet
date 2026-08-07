import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  vi.restoreAllMocks();
});

describe("structured logger", () => {
  it("emits machine-readable production events and redacts secrets", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("connection_failed", {
      apiKey: "top-secret",
      message: "token=visible-to-the-logger",
      error: new Error("request failed"),
    });

    const payload = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      level: "error",
      event: "connection_failed",
      apiKey: "[redacted]",
      message: "token=[redacted]",
      error: { name: "Error", message: "request failed" },
    });
    expect(payload.timestamp).toEqual(expect.any(String));
  });
});
