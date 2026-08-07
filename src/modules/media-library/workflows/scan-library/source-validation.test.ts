import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    listActiveMediaLibraryPaths: vi.fn(),
}));

import { listActiveMediaLibraryPaths } from "@/modules/media-library/repositories/media-library-repository";

import { validateScanSources } from "./source-validation";

const listPathsMock = vi.mocked(listActiveMediaLibraryPaths);

beforeEach(() => vi.clearAllMocks());

describe("validateScanSources", () => {
    it("limits an import-triggered scan to the affected paths", async () => {
        const sources = [
            { path: { id: "11111111-1111-4111-8111-111111111111" } },
            { path: { id: "22222222-2222-4222-8222-222222222222" } },
        ];

        listPathsMock.mockResolvedValue(sources as never);

        const result = await validateScanSources("user-1", {
            pathIds: ["22222222-2222-4222-8222-222222222222"],
        });

        expect(result.sources).toEqual([sources[1]]);
    });

    it("fails closed when every requested path is inactive", async () => {
        listPathsMock.mockResolvedValue([]);

        await expect(
            validateScanSources("user-1", {
                pathIds: ["22222222-2222-4222-8222-222222222222"],
            }),
        ).rejects.toMatchObject({ code: "no_paths" });
    });
});
