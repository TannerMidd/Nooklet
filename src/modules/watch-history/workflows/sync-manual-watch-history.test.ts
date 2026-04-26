import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));
vi.mock("@/modules/watch-history/normalization", () => ({
  parseManualWatchHistoryEntries: vi.fn(),
}));
vi.mock("@/modules/watch-history/repositories/watch-history-repository", () => ({
  completeWatchHistorySyncRun: vi.fn(),
  createWatchHistorySyncRun: vi.fn(),
  failWatchHistorySyncRun: vi.fn(),
  replaceWatchHistoryItemsForSource: vi.fn(),
  upsertWatchHistorySource: vi.fn(),
}));

import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { parseManualWatchHistoryEntries } from "@/modules/watch-history/normalization";
import {
  completeWatchHistorySyncRun,
  createWatchHistorySyncRun,
  failWatchHistorySyncRun,
  replaceWatchHistoryItemsForSource,
  upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";

import { syncManualWatchHistory } from "./sync-manual-watch-history";

const parseMock = vi.mocked(parseManualWatchHistoryEntries);
const upsertSourceMock = vi.mocked(upsertWatchHistorySource);
const createRunMock = vi.mocked(createWatchHistorySyncRun);
const completeRunMock = vi.mocked(completeWatchHistorySyncRun);
const failRunMock = vi.mocked(failWatchHistorySyncRun);
const replaceItemsMock = vi.mocked(replaceWatchHistoryItemsForSource);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

describe("syncManualWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertSourceMock.mockResolvedValue({ id: "src-1", sourceType: "manual" } as never);
    createRunMock.mockResolvedValue({ id: "run-1" } as never);
    completeRunMock.mockResolvedValue(undefined as never);
    failRunMock.mockResolvedValue(undefined as never);
    replaceItemsMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects with field=entriesText when no parseable entries are present", async () => {
    parseMock.mockReturnValue([]);

    const result = await syncManualWatchHistory(USER_ID, {
      mediaType: "tv",
      entriesText: "   ",
    });

    expect(result).toEqual({
      ok: false,
      message:
        "Paste at least one watched title. Use one line per title, optionally with the year in parentheses.",
      field: "entriesText",
    });
    expect(upsertSourceMock).not.toHaveBeenCalled();
  });

  it("persists parsed entries with descending watchedAt timestamps and emits a success audit event", async () => {
    parseMock.mockReturnValue([
      { title: "A", year: 2024 },
      { title: "B", year: null },
      { title: "C", year: 2020 },
    ] as never);

    const before = Date.now();
    const result = await syncManualWatchHistory(USER_ID, {
      mediaType: "tv",
      entriesText: "A (2024)\nB\nC (2020)",
    });
    const after = Date.now();

    expect(parseMock).toHaveBeenCalledWith("tv", "A (2024)\nB\nC (2020)");

    expect(replaceItemsMock).toHaveBeenCalledTimes(1);
    const persistArgs = replaceItemsMock.mock.calls[0]?.[0];
    expect(persistArgs).toMatchObject({
      sourceId: "src-1",
      userId: USER_ID,
      mediaType: "tv",
    });

    const items = (persistArgs?.items ?? []) as Array<{ title: string; watchedAt: Date }>;
    expect(items).toHaveLength(3);
    // Each subsequent watchedAt must be exactly 1 second earlier than the previous one.
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1]!.watchedAt.getTime() - items[i]!.watchedAt.getTime()).toBe(1000);
    }
    // Newest watchedAt must be within the call window.
    expect(items[0]!.watchedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(items[0]!.watchedAt.getTime()).toBeLessThanOrEqual(after);

    expect(completeRunMock).toHaveBeenCalledWith("run-1", 3);
    expect(failRunMock).not.toHaveBeenCalled();

    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: USER_ID,
      eventType: "watch-history.sync.succeeded",
      subjectId: "src-1",
    }));
    expect(JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}")).toMatchObject({
      sourceType: "manual",
      mediaType: "tv",
      itemCount: 3,
    });

    expect(result).toEqual({
      ok: true,
      message: "Imported 3 TV titles into watch history.",
    });
  });

  it("uses the movie noun in the success message when mediaType is movie", async () => {
    parseMock.mockReturnValue([{ title: "Heat", year: 1995 }] as never);

    const result = await syncManualWatchHistory(USER_ID, {
      mediaType: "movie",
      entriesText: "Heat (1995)",
    });

    expect(result).toEqual({
      ok: true,
      message: "Imported 1 movie titles into watch history.",
    });
  });

  it("upserts a source with null metadata and the manual display name", async () => {
    parseMock.mockReturnValue([{ title: "X" }] as never);

    await syncManualWatchHistory(USER_ID, { mediaType: "tv", entriesText: "X" });

    expect(upsertSourceMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sourceType: "manual",
      displayName: "Manual watch history",
      metadata: null,
    });
  });

  it("fails the run, emits a failure audit event, and surfaces the error message when persistence throws", async () => {
    parseMock.mockReturnValue([{ title: "X" }] as never);
    replaceItemsMock.mockRejectedValue(new Error("DB write failed"));

    const result = await syncManualWatchHistory(USER_ID, { mediaType: "tv", entriesText: "X" });

    expect(failRunMock).toHaveBeenCalledWith("run-1", "DB write failed");
    expect(completeRunMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe("watch-history.sync.failed");
    expect(result).toEqual({ ok: false, message: "DB write failed" });
  });

  it("translates a non-Error throw into a stable generic message", async () => {
    parseMock.mockReturnValue([{ title: "X" }] as never);
    replaceItemsMock.mockImplementation(async () => {
      throw "raw failure";
    });

    const result = await syncManualWatchHistory(USER_ID, { mediaType: "tv", entriesText: "X" });

    expect(result).toEqual({
      ok: false,
      message: "Watch-history sync failed unexpectedly.",
    });
  });
});
