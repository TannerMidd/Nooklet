import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/plex", () => ({
  listPlexHistory: vi.fn(),
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

import { listPlexHistory } from "@/lib/integrations/plex";
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
import {
  normalizeWatchHistorySyncItems,
  resolveWatchHistoryFetchLimit,
} from "@/modules/watch-history/workflows/watch-history-sync-helpers";

import { syncPlexWatchHistory } from "./sync-plex-watch-history";

const findMock = vi.mocked(findServiceConnectionByType);
const upsertSourceMock = vi.mocked(upsertWatchHistorySource);
const createRunMock = vi.mocked(createWatchHistorySyncRun);
const completeRunMock = vi.mocked(completeWatchHistorySyncRun);
const failRunMock = vi.mocked(failWatchHistorySyncRun);
const replaceItemsMock = vi.mocked(replaceWatchHistoryItemsForSource);
const auditMock = vi.mocked(createAuditEvent);
const listHistoryMock = vi.mocked(listPlexHistory);
const decryptMock = vi.mocked(decryptSecret);
const resolveLimitMock = vi.mocked(resolveWatchHistoryFetchLimit);
const normalizeMock = vi.mocked(normalizeWatchHistorySyncItems);

const USER_ID = "user-1";

function buildVerifiedPlexConnection(overrides: Record<string, unknown> = {}) {
  return {
    connection: {
      baseUrl: "https://plex.test:32400",
      status: "verified",
    },
    secret: { encryptedValue: "plex-enc", maskedValue: "plex-mask" },
    metadata: {
      serverName: "Home Plex",
      machineIdentifier: "abc",
      version: "1.0",
      availableUsers: [
        { id: "user-id-7", name: "Owner" },
        { id: "user-id-8", name: "Kid" },
      ],
    },
    ...overrides,
  } as never;
}

function buildInput(overrides: Partial<{ mediaType: "tv" | "movie"; plexUserId: string; importLimit: number }> = {}) {
  return {
    mediaType: "tv" as const,
    plexUserId: "user-id-7",
    importLimit: 50,
    ...overrides,
  };
}

describe("syncPlexWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertSourceMock.mockResolvedValue({ id: "src-1", sourceType: "plex" } as never);
    createRunMock.mockResolvedValue({ id: "run-1" } as never);
    completeRunMock.mockResolvedValue(undefined as never);
    failRunMock.mockResolvedValue(undefined as never);
    replaceItemsMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("fails when no Plex connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await syncPlexWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connect Plex before syncing watch history.",
    });
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("fails when the Plex connection is not yet verified", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection({
      connection: { baseUrl: "https://plex.test", status: "configured" },
    }));

    const result = await syncPlexWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Verify the Plex connection before syncing watch history.",
    });
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("fails with field=plexUserId when the requested user is not in availableUsers", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());

    const result = await syncPlexWatchHistory(USER_ID, buildInput({ plexUserId: "ghost-user" }));

    expect(result).toEqual({
      ok: false,
      message: "Select a verified Plex user before syncing history.",
      field: "plexUserId",
    });
    expect(createRunMock).not.toHaveBeenCalled();
  });

  it("decrypts the secret, applies the resolved fetch limit, and persists normalized items on success", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());
    listHistoryMock.mockResolvedValue([{ raw: 1 }, { raw: 2 }, { raw: 3 }] as never);

    const result = await syncPlexWatchHistory(USER_ID, buildInput({ importLimit: 50 }));

    expect(decryptMock).toHaveBeenCalledWith("plex-enc");
    expect(resolveLimitMock).toHaveBeenCalledWith(50);
    expect(listHistoryMock).toHaveBeenCalledWith({
      baseUrl: "https://plex.test:32400",
      apiKey: "dec(plex-enc)",
      mediaType: "tv",
      userId: "user-id-7",
      limit: 100, // resolveWatchHistoryFetchLimit mock doubles
    });
    expect(normalizeMock).toHaveBeenCalledWith("tv", [{ raw: 1 }, { raw: 2 }, { raw: 3 }], 50);

    expect(replaceItemsMock).toHaveBeenCalledTimes(1);
    expect(replaceItemsMock.mock.calls[0]?.[0]).toMatchObject({
      sourceId: "src-1",
      userId: USER_ID,
      mediaType: "tv",
    });

    expect(completeRunMock).toHaveBeenCalledWith("run-1", 3);
    expect(failRunMock).not.toHaveBeenCalled();

    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: USER_ID,
      eventType: "watch-history.sync.succeeded",
      subjectId: "src-1",
    }));
    const auditPayload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(auditPayload).toMatchObject({
      sourceType: "plex",
      mediaType: "tv",
      itemCount: 3,
      selectedUserId: "user-id-7",
      selectedUserName: "Owner",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Imported 3 TV titles from Plex for Owner.");
  });

  it("returns the empty-history success message when zero items are imported", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());
    listHistoryMock.mockResolvedValue([] as never);

    const result = await syncPlexWatchHistory(USER_ID, buildInput({ mediaType: "movie" }));

    expect(result.ok).toBe(true);
    expect(result.message).toBe("No movie history items were returned from Plex for Owner.");
    expect(completeRunMock).toHaveBeenCalledWith("run-1", 0);
  });

  it("upserts the source with the server-name-prefixed display name and import limit metadata", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());
    listHistoryMock.mockResolvedValue([] as never);

    await syncPlexWatchHistory(USER_ID, buildInput({ importLimit: 25 }));

    expect(upsertSourceMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sourceType: "plex",
      displayName: "Home Plex via Plex",
      metadata: {
        selectedUserId: "user-id-7",
        selectedUserName: "Owner",
        importLimit: 25,
      },
    });
  });

  it("fails the run, emits a failure audit event, and surfaces the error message when the integration throws", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());
    listHistoryMock.mockRejectedValue(new Error("Plex 503"));

    const result = await syncPlexWatchHistory(USER_ID, buildInput());

    expect(failRunMock).toHaveBeenCalledWith("run-1", "Plex 503");
    expect(completeRunMock).not.toHaveBeenCalled();
    expect(replaceItemsMock).not.toHaveBeenCalled();

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe("watch-history.sync.failed");
    const auditPayload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(auditPayload).toMatchObject({ error: "Plex 503", selectedUserId: "user-id-7" });

    expect(result).toEqual({ ok: false, message: "Plex 503" });
  });

  it("translates a non-Error throw into a stable generic message and never leaks the secret", async () => {
    findMock.mockResolvedValue(buildVerifiedPlexConnection());
    listHistoryMock.mockImplementation(async () => {
      throw "raw with apiKey=dec(plex-enc)";
    });

    const result = await syncPlexWatchHistory(USER_ID, buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Watch-history sync failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("dec(plex-enc)");
    expect(JSON.stringify(result)).not.toContain("plex-enc");
  });
});
