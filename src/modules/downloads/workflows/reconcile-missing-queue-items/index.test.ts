import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../import-completed-downloads/client-resolution", () => ({
  resolveImportSabnzbdClient: vi.fn(),
}));
vi.mock("./queue-resolution", () => ({
  resolveMissingQueueSnapshot: vi.fn(),
}));
vi.mock("./missing-queue-retry", () => ({
  retryMissingSabnzbdQueueItems: vi.fn(),
}));
vi.mock("./audit", () => ({
  recordMissingQueueItemAudit: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/targeted-sabnzbd-history", () => ({
  listTrackedSabnzbdHistory: vi.fn(),
}));

import {
  listTrackedSabnzbdHistory,
} from "@/modules/downloads/workflows/targeted-sabnzbd-history";
import { resolveImportSabnzbdClient } from "../import-completed-downloads/client-resolution";
import { recordMissingQueueItemAudit } from "./audit";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "./index";
import { retryMissingSabnzbdQueueItems } from "./missing-queue-retry";
import { resolveMissingQueueSnapshot } from "./queue-resolution";

const resolveClientMock = vi.mocked(resolveImportSabnzbdClient);
const resolveSnapshotMock = vi.mocked(resolveMissingQueueSnapshot);
const retryMock = vi.mocked(retryMissingSabnzbdQueueItems);
const auditMock = vi.mocked(recordMissingQueueItemAudit);
const listHistoryMock = vi.mocked(listTrackedSabnzbdHistory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileMissingSabnzbdQueueItemsWorkflow", () => {
  it("calls phases in order and returns retry results", async () => {
    const calls: string[] = [];
    const client = { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" };
    const snapshot = { items: [] };
    const history = { items: [] };
    const result = {
      missingCount: 1,
      attemptedCount: 1,
      queuedCount: 1,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    };

    resolveClientMock.mockImplementation(async () => {
      calls.push("client");
      return client as never;
    });
    resolveSnapshotMock.mockImplementation(async () => {
      calls.push("queue");
      return snapshot as never;
    });
    listHistoryMock.mockImplementation(async () => {
      calls.push("history");
      return history as never;
    });
    retryMock.mockImplementation(async () => {
      calls.push("retry");
      return result;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    await expect(reconcileMissingSabnzbdQueueItemsWorkflow("user1", {
      queueSnapshot: snapshot as never,
    })).resolves.toBe(result);

    expect(resolveClientMock).toHaveBeenCalledWith("user1");
    expect(resolveSnapshotMock).toHaveBeenCalledWith(client, snapshot);
    expect(listHistoryMock).toHaveBeenCalledWith(
      "user1",
      client,
      { timeoutMs: 20_000 },
    );
    expect(retryMock).toHaveBeenCalledWith("user1", client, snapshot, history);
    expect(auditMock).toHaveBeenCalledWith("user1", result);
    expect(calls).toEqual(["client", "queue", "history", "retry", "audit"]);
  });
});
