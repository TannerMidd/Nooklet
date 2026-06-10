import { describe, expect, it } from "vitest";

import { QueueIndexerResultWorkflowError } from "./errors";
import { ensureSabnzbdCompatibleResult } from "./protocol-guard";

describe("ensureSabnzbdCompatibleResult", () => {
  it("allows newznab releases", () => {
    expect(() =>
      ensureSabnzbdCompatibleResult({ indexerProtocol: "newznab" } as never),
    ).not.toThrow();
  });

  it("rejects torznab releases with a typed unsupported_protocol error", () => {
    let caught: unknown;

    try {
      ensureSabnzbdCompatibleResult({ indexerProtocol: "torznab" } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(QueueIndexerResultWorkflowError);
    expect((caught as QueueIndexerResultWorkflowError).code).toBe("unsupported_protocol");
  });
});
