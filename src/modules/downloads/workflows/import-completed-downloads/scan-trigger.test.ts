import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/workflows/scan-library", () => ({
    scanMediaLibraryWorkflow: vi.fn(),
}));

import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";

import { triggerCompletedDownloadDiscovery } from "./scan-trigger";

const scanMock = vi.mocked(scanMediaLibraryWorkflow);

beforeEach(() => vi.clearAllMocks());

describe("triggerCompletedDownloadDiscovery", () => {
    it("scans only library paths that received imported files", async () => {
        scanMock.mockResolvedValue({} as never);
        const affectedLibraryPathIds = [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
        ];

        await triggerCompletedDownloadDiscovery("user-1", {
            matchedCount: 1,
            importedCount: 1,
            failedCount: 0,
            importedFileCount: 2,
            affectedLibraryPathIds,
        });

        expect(scanMock).toHaveBeenCalledWith("user-1", { pathIds: affectedLibraryPathIds });
    });

    it("does not scan when no files were imported", async () => {
        const result = await triggerCompletedDownloadDiscovery("user-1", {
            matchedCount: 0,
            importedCount: 0,
            failedCount: 0,
            importedFileCount: 0,
            affectedLibraryPathIds: [],
        });

        expect(result.attempted).toBe(false);
        expect(scanMock).not.toHaveBeenCalled();
    });
});
