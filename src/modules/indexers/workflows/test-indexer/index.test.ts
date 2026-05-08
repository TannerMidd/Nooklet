import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", () => ({
  validateTestIndexerRequest: vi.fn(),
}));
vi.mock("./credential-resolution", () => ({
  resolveTestIndexerConnection: vi.fn(),
}));
vi.mock("./indexer-execution", () => ({
  executeTestIndexerConnection: vi.fn(),
}));
vi.mock("./persistence", () => ({
  persistTestIndexerResult: vi.fn(),
}));
vi.mock("./audit", () => ({
  recordTestIndexerAudit: vi.fn(),
}));

import { recordTestIndexerAudit } from "./audit";
import { resolveTestIndexerConnection } from "./credential-resolution";
import { executeTestIndexerConnection } from "./indexer-execution";
import { testIndexerWorkflow } from "./index";
import { persistTestIndexerResult } from "./persistence";
import { validateTestIndexerRequest } from "./request-validation";

const validateMock = vi.mocked(validateTestIndexerRequest);
const resolveMock = vi.mocked(resolveTestIndexerConnection);
const executeMock = vi.mocked(executeTestIndexerConnection);
const persistMock = vi.mocked(persistTestIndexerResult);
const auditMock = vi.mocked(recordTestIndexerAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("testIndexerWorkflow", () => {
  it("calls phases in order and returns the persisted result", async () => {
    const calls: string[] = [];
    const request = { id: "idx1" };
    const connection = { indexer: { id: "idx1" }, apiKey: "secret", categories: ["2000"] };
    const execution = { ok: true, message: "Indexer test succeeded with 0 results.", resultCount: 0 };
    const persisted = { ...execution, testedAt: new Date("2026-05-08T00:00:00.000Z") };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request;
    });
    resolveMock.mockImplementation(async () => {
      calls.push("resolve");
      return connection as never;
    });
    executeMock.mockImplementation(async () => {
      calls.push("execute");
      return execution;
    });
    persistMock.mockImplementation(async () => {
      calls.push("persist");
      return persisted;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    const result = await testIndexerWorkflow("u1", { id: "idx1" });

    expect(calls).toEqual(["validate", "resolve", "execute", "persist", "audit"]);
    expect(validateMock).toHaveBeenCalledWith({ id: "idx1" });
    expect(resolveMock).toHaveBeenCalledWith("u1", request);
    expect(executeMock).toHaveBeenCalledWith(connection);
    expect(persistMock).toHaveBeenCalledWith("u1", connection, execution);
    expect(auditMock).toHaveBeenCalledWith("u1", connection, persisted);
    expect(result).toBe(persisted);
  });
});
