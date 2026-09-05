import { describe, expect, it } from "vitest";

import {
    parseYouTubeLibrarySearchParams,
    youtubeLibraryHref,
} from "@/app/(workspace)/library/youtube/search-params";

describe("YouTube library search parameters", () => {
    it("uses the search view when values are missing or unsupported", () => {
        expect(parseYouTubeLibrarySearchParams(undefined)).toEqual({ view: "search", q: "" });
        expect(parseYouTubeLibrarySearchParams({ view: "unknown" })).toEqual({
            view: "search",
            q: "",
        });
    });

    it("normalizes a scalar value from arrays and trims the query", () => {
        expect(
            parseYouTubeLibrarySearchParams({
                view: ["sources", "videos"],
                q: ["  science channel  ", "ignored"],
            }),
        ).toEqual({ view: "sources", q: "science channel" });
    });

    it("builds encoded, bookmarkable view links", () => {
        expect(youtubeLibraryHref("videos", "  cats & dogs ")).toBe(
            "/library/youtube?view=videos&q=cats+%26+dogs",
        );
    });

    it("normalizes a video source filter and page number", () => {
        expect(
            parseYouTubeLibrarySearchParams({
                view: "videos",
                sourceId: " source-1 ",
                page: "3",
            }),
        ).toEqual({ view: "videos", q: "", sourceId: "source-1", page: 3 });
        expect(youtubeLibraryHref("videos", undefined, { sourceId: "source-1", page: 3 })).toBe(
            "/library/youtube?view=videos&sourceId=source-1&page=3",
        );
    });
});
