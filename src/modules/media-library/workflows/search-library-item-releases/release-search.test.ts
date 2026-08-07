import { describe, expect, it } from "vitest";

import { buildLibraryItemReleaseSearchQuery } from "./release-search";

describe("buildLibraryItemReleaseSearchQuery", () => {
    it("uses title and year for movie searches", () => {
        const query = buildLibraryItemReleaseSearchQuery({
            title: { title: "Arrival", year: 2016 },
            episode: null,
        } as never);

        expect(query).toBe("Arrival 2016");
    });

    it("uses the episode code for TV episode searches", () => {
        const query = buildLibraryItemReleaseSearchQuery({
            title: { title: "Severance", year: 2022 },
            episode: { seasonNumber: 1, episodeNumber: 2 },
        } as never);

        expect(query).toBe("Severance S01E02");
    });

    it("uses the season code for TV season searches", () => {
        const query = buildLibraryItemReleaseSearchQuery({
            title: { title: "Severance", year: 2022 },
            season: { seasonNumber: 2 },
            episode: null,
        } as never);

        expect(query).toBe("Severance S02");
    });
});
