import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    expireStalePendingDownloadReservations: vi.fn(),
    listUsersWithActiveDownloadRequests: vi.fn(),
}));

import {
    expireStalePendingDownloadReservations,
    listUsersWithActiveDownloadRequests,
} from "@/modules/downloads/repositories/download-repository";

import { listUsersWithActiveDownloadRequestsForImport } from "./list-users-with-active-download-requests";

const expireMock = vi.mocked(expireStalePendingDownloadReservations);
const listMock = vi.mocked(listUsersWithActiveDownloadRequests);

beforeEach(() => {
    vi.clearAllMocks();
    expireMock.mockResolvedValue(0);
    listMock.mockResolvedValue([]);
});

describe("listUsersWithActiveDownloadRequestsForImport", () => {
    it("reconciles stale reservations before selecting maintenance users", async () => {
        const calls: string[] = [];

        expireMock.mockImplementation(async () => {
            calls.push("expire");

            return 1;
        });
        listMock.mockImplementation(async () => {
            calls.push("list");

            return ["user-1"];
        });

        await expect(listUsersWithActiveDownloadRequestsForImport()).resolves.toEqual(["user-1"]);
        expect(calls).toEqual(["expire", "list"]);
    });
});
