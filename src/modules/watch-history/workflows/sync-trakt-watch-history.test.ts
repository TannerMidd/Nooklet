import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/trakt", () => ({
    listTraktWatchedHistory: vi.fn(),
    parseTraktSecret: vi.fn(),
}));

vi.mock("@/lib/security/secret-box", () => ({
    decryptSecret: vi.fn(() => "client-id\naccess-token"),
}));

vi.mock("@/modules/service-connections/public", () => ({
    findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/watch-history/repositories/watch-history-repository", () => ({
    createWatchHistorySyncRun: vi.fn(),
    failWatchHistorySyncRun: vi.fn(),
    replaceWatchHistoryItemsAndCompleteSyncRun: vi.fn(),
    upsertWatchHistorySource: vi.fn(),
}));

vi.mock("@/modules/watch-history/workflows/watch-history-sync-helpers", () => ({
    normalizeWatchHistorySyncItems: vi.fn(),
    resolveWatchHistoryFetchLimit: vi.fn(),
}));

vi.mock("@/modules/watch-history/workflows/watch-history-sync-audit", () => ({
    describeWatchHistorySyncError: vi.fn(() => ({ name: "Error" })),
    recordWatchHistorySyncAudit: vi.fn(),
}));

import { listTraktWatchedHistory, parseTraktSecret } from "@/lib/integrations/trakt";
import { findServiceConnectionByType } from "@/modules/service-connections/public";
import {
    createWatchHistorySyncRun,
    failWatchHistorySyncRun,
    replaceWatchHistoryItemsAndCompleteSyncRun,
    upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";
import {
    normalizeWatchHistorySyncItems,
    resolveWatchHistoryFetchLimit,
} from "@/modules/watch-history/workflows/watch-history-sync-helpers";
import { recordWatchHistorySyncAudit } from "@/modules/watch-history/workflows/watch-history-sync-audit";

import { syncTraktWatchHistory } from "./sync-trakt-watch-history";

const findConnectionMock = vi.mocked(findServiceConnectionByType);
const parseSecretMock = vi.mocked(parseTraktSecret);
const listHistoryMock = vi.mocked(listTraktWatchedHistory);
const upsertSourceMock = vi.mocked(upsertWatchHistorySource);
const createRunMock = vi.mocked(createWatchHistorySyncRun);
const failRunMock = vi.mocked(failWatchHistorySyncRun);
const publishRunMock = vi.mocked(replaceWatchHistoryItemsAndCompleteSyncRun);
const normalizeMock = vi.mocked(normalizeWatchHistorySyncItems);
const resolveLimitMock = vi.mocked(resolveWatchHistoryFetchLimit);
const auditMock = vi.mocked(recordWatchHistorySyncAudit);

const USER_ID = "user-1";

function buildConnection() {
    return {
        connection: {
            baseUrl: "https://trakt.test",
            status: "verified",
        },
        secret: {
            encryptedValue: "encrypted-trakt-secret",
        },
        metadata: {
            username: "trakt-user",
            displayName: "Trakt User",
        },
    } as never;
}

describe("syncTraktWatchHistory", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        findConnectionMock.mockResolvedValue(buildConnection());
        parseSecretMock.mockReturnValue({
            ok: true,
            clientId: "client-id",
            accessToken: "access-token",
        } as never);
        listHistoryMock.mockResolvedValue([] as never);
        upsertSourceMock.mockResolvedValue({ id: "src-1", sourceType: "trakt" } as never);
        createRunMock.mockResolvedValue({ id: "run-1" } as never);
        publishRunMock.mockResolvedValue(true);
        failRunMock.mockResolvedValue(true);
        normalizeMock.mockReturnValue([] as never);
        resolveLimitMock.mockReturnValue(100);
    });

    it("does not emit success when completion loses the pending guard", async () => {
        publishRunMock.mockResolvedValue(false);

        const result = await syncTraktWatchHistory(USER_ID, {
            mediaType: "movie",
            importLimit: 50,
        });

        expect(result).toEqual({
            ok: false,
            message: "This Trakt watch-history sync was already finalized.",
        });
        expect(auditMock).not.toHaveBeenCalled();
        expect(failRunMock).not.toHaveBeenCalled();
    });

    it("does not emit failure when failure completion loses the pending guard", async () => {
        listHistoryMock.mockRejectedValue(new Error("Trakt 503"));
        failRunMock.mockResolvedValue(false);

        const result = await syncTraktWatchHistory(USER_ID, {
            mediaType: "movie",
            importLimit: 50,
        });

        expect(result).toEqual({
            ok: false,
            message: "This Trakt watch-history sync was already finalized.",
        });
        expect(auditMock).not.toHaveBeenCalled();
    });
});
