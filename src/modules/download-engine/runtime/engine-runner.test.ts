import { describe, expect, it } from "vitest";

import { FinalizeDownloadError } from "@/modules/download-engine/finalize/finalize-download";
import { NntpError } from "@/modules/download-engine/nntp/nntp-client";

import {
  classifyEngineNntpFailureKinds,
  classifyEngineRuntimeError,
} from "./engine-runner";

describe("engine failure classification", () => {
  it.each(["connect-failed", "auth-failed", "timeout", "connection-closed"] as const)(
    "classifies %s as infrastructure",
    (kind) => {
      expect(classifyEngineNntpFailureKinds([kind])).toBe("infrastructure");
      expect(classifyEngineRuntimeError(new NntpError(kind, "NNTP failed."))).toBe(
        "infrastructure",
      );
    },
  );

  it.each(["article-not-found", "article-unusable", "protocol-error"] as const)(
    "classifies %s as release content",
    (kind) => {
      expect(classifyEngineNntpFailureKinds([kind])).toBe("content");
      expect(classifyEngineRuntimeError(new NntpError(kind, "Article failed."))).toBe(
        "content",
      );
    },
  );

  // Regression: articles that arrive intact but will not decode into the file
  // the NZB filed them under must never be reported as a downloader problem.
  // That verdict tells the retry pipeline the connection is broken, and it
  // stops trying other releases for the item entirely.
  it("never reads a storm of undecodable articles as a downloader problem", () => {
    expect(classifyEngineNntpFailureKinds(Array(80).fill("article-unusable"))).toBe("content");
  });

  it("retains infrastructure classification through a failed partial-transfer finalize", () => {
    expect(classifyEngineRuntimeError(
      new FinalizeDownloadError("Repair failed."),
      ["timeout"],
    )).toBe("infrastructure");
  });

  it("classifies disk exhaustion as infrastructure", () => {
    expect(classifyEngineRuntimeError(Object.assign(new Error("Disk full."), {
      code: "ENOSPC",
    }))).toBe("infrastructure");
  });
});
