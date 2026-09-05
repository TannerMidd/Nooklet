import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/queries/get-verified-tmdb-connection", () => ({
    getVerifiedTmdbConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/public", () => ({ searchTmdbTitles: vi.fn() }));

import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";
import { searchTmdbTitles } from "@/modules/service-connections/public";
import { searchDiscoverTitles } from "./search-discover-titles";

beforeEach(() => vi.resetAllMocks());

describe("searchDiscoverTitles recovery", () => {
    it("identifies an unconfigured metadata service without running a search", async () => {
        vi.mocked(getVerifiedTmdbConnection).mockResolvedValue(null);
        expect(
            await searchDiscoverTitles("u1", { mediaType: "movie", query: "Arrival" }),
        ).toMatchObject({ ok: false, reason: "tmdb-not-configured" });
        expect(searchTmdbTitles).not.toHaveBeenCalled();
    });

    it("turns rejected transport or invalid JSON into a recoverable search error", async () => {
        vi.mocked(getVerifiedTmdbConnection).mockResolvedValue({
            baseUrl: "https://tmdb.test",
            secret: "private",
        } as never);
        vi.mocked(searchTmdbTitles).mockRejectedValue(new Error("private transport diagnostics"));
        const result = await searchDiscoverTitles("u1", { mediaType: "movie", query: "Arrival" });

        expect(result).toMatchObject({ ok: false, reason: "tmdb-error" });
        expect(JSON.stringify(result)).not.toContain("private");
    });
});
