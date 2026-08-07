import { describe, expect, it } from "vitest";

import { parseLibraryBrowseSearchParams } from "./library-browse-search-params";

describe("parseLibraryBrowseSearchParams", () => {
    it("accepts a normal search submitted with default filter values", () => {
        expect(
            parseLibraryBrowseSearchParams({
                q: "Alien",
                status: "",
                monitored: "",
                library: "",
                sort: "title",
                view: "list",
            }),
        ).toEqual({
            q: "Alien",
            page: 1,
            details: undefined,
            status: undefined,
            monitored: undefined,
            library: undefined,
            sort: "title",
            view: "list",
        });
    });

    it("normalizes legacy all-filter values instead of crashing a bookmarked URL", () => {
        expect(
            parseLibraryBrowseSearchParams({
                q: "Severance",
                status: "all",
                monitored: "all",
                library: "all",
            }),
        ).toMatchObject({
            q: "Severance",
            status: undefined,
            monitored: undefined,
            library: undefined,
        });
    });

    it("preserves valid filters", () => {
        expect(
            parseLibraryBrowseSearchParams({
                q: " Dune ",
                page: "3",
                details: "65278952-c9c8-49bc-bd27-b77e8fd499e9",
                status: "missing",
                monitored: "yes",
                library: "unassigned",
                sort: "recent",
                view: "grid",
            }),
        ).toEqual({
            q: "Dune",
            page: 3,
            details: "65278952-c9c8-49bc-bd27-b77e8fd499e9",
            status: "missing",
            monitored: "yes",
            library: "unassigned",
            sort: "recent",
            view: "grid",
        });
    });

    it("fails soft for malformed or stale external query parameters", () => {
        expect(
            parseLibraryBrowseSearchParams({
                q: "x".repeat(121),
                page: "-4",
                details: "not-a-title-id",
                status: "archived",
                monitored: "sometimes",
                library: "not-a-library-id",
                sort: "random",
                view: "poster-wall",
            }),
        ).toEqual({
            q: undefined,
            page: 1,
            details: undefined,
            status: undefined,
            monitored: undefined,
            library: undefined,
            sort: "title",
            view: "list",
        });
    });

    it("uses the first value when a query parameter is repeated", () => {
        expect(
            parseLibraryBrowseSearchParams({
                q: ["Arrival", "Alien"],
                page: ["2", "5"],
                status: ["available", "missing"],
            }),
        ).toMatchObject({
            q: "Arrival",
            page: 2,
            status: "available",
        });
    });
});
