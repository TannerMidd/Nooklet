import { describe, expect, it } from "vitest";

import { QueueIndexerResultWorkflowError } from "./errors";
import { ensureUsenetCompatibleResult } from "./protocol-guard";

describe("ensureUsenetCompatibleResult", () => {
  it("allows newznab releases", () => {
    expect(() =>
      ensureUsenetCompatibleResult({ indexerProtocol: "newznab" } as never),
    ).not.toThrow();
  });

  it("rejects torznab releases with a typed unsupported_protocol error", () => {
    let caught: unknown;

    try {
      ensureUsenetCompatibleResult({ indexerProtocol: "torznab" } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(QueueIndexerResultWorkflowError);
    expect((caught as QueueIndexerResultWorkflowError).code).toBe("unsupported_protocol");
  });
});
