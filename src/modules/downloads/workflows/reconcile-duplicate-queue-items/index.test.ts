import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../import-completed-downloads/client-resolution", () => ({
  resolveImportSabnzbdClient: vi.fn(),
}));
vi.mock("./queue-resolution", () => ({
  resolveDuplicateQueueSnapshot: vi.fn(),
}));
vi.mock("./duplicate-removal", () => ({
  removeDuplicateSabnzbdQueueItems: vi.fn(),
}));
vi.mock("./audit", () => ({
  recordDuplicateQueueItemAudit: vi.fn(),
}));

import { resolveImportSabnzbdClient } from "../import-completed-downloads/client-resolution";
import { recordDuplicateQueueItemAudit } from "./audit";
import { removeDuplicateSabnzbdQueueItems } from "./duplicate-removal";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "./index";
import { resolveDuplicateQueueSnapshot } from "./queue-resolution";

const resolveClientMock = vi.mocked(resolveImportSabnzbdClient);
const resolveSnapshotMock = vi.mocked(resolveDuplicateQueueSnapshot);
const removeDuplicatesMock = vi.mocked(removeDuplicateSabnzbdQueueItems);
const auditMock = vi.mocked(recordDuplicateQueueItemAudit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileDuplicateSabnzbdQueueItemsWorkflow", () => {
  it("calls phases in order and returns duplicate reconciliation results", async () => {
    const calls: string[] = [];
    const client = { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" };
    const snapshot = { items: [] };
    const result = { duplicateGroupCount: 1, keptCount: 1, removedCount: 1, failedCount: 0 };

    resolveClientMock.mockImplementation(async () => {
      calls.push("client");
      return client as never;
    });
    resolveSnapshotMock.mockImplementation(async () => {
      calls.push("queue");
      return snapshot as never;
    });
    removeDuplicatesMock.mockImplementation(async () => {
      calls.push("duplicates");
      return result;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    await expect(reconcileDuplicateSabnzbdQueueItemsWorkflow("user1", {
      queueSnapshot: snapshot as never,
    })).resolves.toBe(result);

    expect(resolveClientMock).toHaveBeenCalledWith("user1");
    expect(resolveSnapshotMock).toHaveBeenCalledWith(client, snapshot);
    expect(removeDuplicatesMock).toHaveBeenCalledWith("user1", client, snapshot);
    expect(auditMock).toHaveBeenCalledWith("user1", result);
    expect(calls).toEqual(["client", "queue", "duplicates", "audit"]);
  });
});