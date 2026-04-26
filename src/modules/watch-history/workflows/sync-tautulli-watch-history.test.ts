import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/tautulli", () => ({
  listTautulliHistory: vi.fn(),
}));
vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));
vi.mock("@/modules/watch-history/repositories/watch-history-repository", () => ({
  completeWatchHistorySyncRun: vi.fn(),
  createWatchHistorySyncRun: vi.fn(),
  failWatchHistorySyncRun: vi.fn(),
  replaceWatchHistoryItemsForSource: vi.fn(),
  upsertWatchHistorySource: vi.fn(),
}));
vi.mock("@/modules/watch-history/workflows/watch-history-sync-helpers", () => ({
  resolveWatchHistoryFetchLimit: vi.fn((limit: number) => limit * 2),
  normalizeWatchHistorySyncItems: vi.fn((_mediaType, raw, limit: number) =>
    (raw as unknown[]).slice(0, limit).map((entry, index) => ({
      title: `t${index}`,
      __raw: entry,
    })),
  ),
}));

import { listTautulliHistory } from "@/lib/integrations/tautulli";
import { decryptSecret } from "@/lib/security/secret-box";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import {
  completeWatchHistorySyncRun,
  createWatchHistorySyncRun,
  failWatchHistorySyncRun,
  replaceWatchHistoryItemsForSource,
  upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";

import { syncTautulliWatchHistory } from "./sync-tautulli-watch-history";

const findMock = vi.mocked(findServiceConnectionByType);
const upsertSourceMock = vi.mocked(upsertWatchHistorySource);
const createRunMock = vi.mocked(createWatchHistorySyncRun);
const completeRunMock = vi.mocked(completeWatchHistorySyncRun);
const failRunMock = vi.mocked(failWatchHistorySyncRun);
const replaceItemsMock = vi.mocked(replaceWatchHistoryItemsForSource);
const auditMock = vi.mocked(createAuditEvent);
const listHistoryMock = vi.mocked(listTautulliHistory);
const decryptMock = vi.mocked(decryptSecret);

const USER_ID = "user-1";

function buildVerifiedTautulliConnection(overrides: Record<string, unknown> = {}) {
  return {
    connection: {
      baseUrl: "https://tautulli.test",
      status: "verified",
    },
    secret: { encryptedValue: "tau-enc", maskedValue: "tau-mask" },
    metadata: {
      serverName: "Tautulli Home",
      availableUsers: [
        { id: "tau-7", name: "Owner" },
        { id: "tau-8", name: "Kid" },
      ],
    },
    ...overrides,
  } as never;
}

function buildInput(overrides: Partial<{ mediaType: "tv" | "movie"; tautulliUserId: string; importLimit: number }> = {}) {
  return {
    mediaType: "tv" as const,
    tautulliUserId: "tau-7",
    importLimit: 50,
    ...overrides,
  };
}

describe("syncTautulliWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertSourceMock.mockResolvedValue({ id: "src-1", sourceType: "tautulli" } as never);
    createRunMock.mockResolvedValue({ id: "run-1" } as never);
    completeRunMock.mockResolvedValue(undefined as never);
    failRunMock.mockResolvedValue(undefined as never);
    replaceItemsMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("fails when no Tautulli connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await syncTautulliWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connect Tautulli before syncing watch history.",
    });
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("fails when the Tautulli connection is not yet verified", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection({
      connection: { baseUrl: "https://tautulli.test", status: "configured" },
    }));

    const result = await syncTautulliWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Verify the Tautulli connection before syncing watch history.",
    });
  });

  it("fails with field=tautulliUserId when the requested user is not in availableUsers", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());

    const result = await syncTautulliWatchHistory(USER_ID, buildInput({ tautulliUserId: "ghost" }));

    expect(result).toEqual({
      ok: false,
      message: "Select a verified Plex user before syncing history.",
      field: "tautulliUserId",
    });
  });

  it("decrypts the secret, applies the resolved fetch limit, and persists normalized items on success", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());
    listHistoryMock.mockResolvedValue([{ raw: 1 }, { raw: 2 }] as never);

    const result = await syncTautulliWatchHistory(USER_ID, buildInput({ importLimit: 50 }));

    expect(decryptMock).toHaveBeenCalledWith("tau-enc");
    expect(listHistoryMock).toHaveBeenCalledWith({
      baseUrl: "https://tautulli.test",
      apiKey: "dec(tau-enc)",
      mediaType: "tv",
      userId: "tau-7",
      limit: 100,
    });

    expect(replaceItemsMock).toHaveBeenCalledTimes(1);
    expect(completeRunMock).toHaveBeenCalledWith("run-1", 2);
    expect(failRunMock).not.toHaveBeenCalled();

    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "watch-history.sync.succeeded",
      subjectId: "src-1",
    }));

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Imported 2 TV titles from Tautulli for Owner.");
  });

  it("returns the empty-history success message when zero items are imported", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());
    listHistoryMock.mockResolvedValue([] as never);

    const result = await syncTautulliWatchHistory(USER_ID, buildInput({ mediaType: "movie" }));

    expect(result.ok).toBe(true);
    expect(result.message).toBe("No movie history items were returned from Tautulli for Owner.");
    expect(completeRunMock).toHaveBeenCalledWith("run-1", 0);
  });

  it("upserts the source with the server-name-prefixed display name and import limit metadata", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());
    listHistoryMock.mockResolvedValue([] as never);

    await syncTautulliWatchHistory(USER_ID, buildInput({ importLimit: 25 }));

    expect(upsertSourceMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sourceType: "tautulli",
      displayName: "Tautulli Home via Tautulli",
      metadata: {
        selectedUserId: "tau-7",
        selectedUserName: "Owner",
        importLimit: 25,
      },
    });
  });

  it("fails the run, emits a failure audit event, and surfaces the error message when the integration throws", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());
    listHistoryMock.mockRejectedValue(new Error("Tautulli 503"));

    const result = await syncTautulliWatchHistory(USER_ID, buildInput());

    expect(failRunMock).toHaveBeenCalledWith("run-1", "Tautulli 503");
    expect(completeRunMock).not.toHaveBeenCalled();
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe("watch-history.sync.failed");

    expect(result).toEqual({ ok: false, message: "Tautulli 503" });
  });

  it("translates a non-Error throw into a stable generic message and never leaks the secret", async () => {
    findMock.mockResolvedValue(buildVerifiedTautulliConnection());
    listHistoryMock.mockImplementation(async () => {
      throw "raw with apiKey=dec(tau-enc)";
    });

    const result = await syncTautulliWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Watch-history sync failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("dec(tau-enc)");
  });
});
