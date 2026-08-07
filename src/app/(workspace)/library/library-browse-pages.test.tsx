import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(workspace)/library/library-title-page", () => ({
    LibraryTitlePage: vi.fn(),
}));

import LibraryMoviesPage from "./movies/page";
import LibraryTvPage from "./tv/page";

describe.each([
    ["movie", LibraryMoviesPage],
    ["tv", LibraryTvPage],
] as const)("%s library browse page", (mediaType, Page) => {
    it("renders a title search when the GET form submits blank filters", async () => {
        const result = await Page({
            searchParams: Promise.resolve({
                q: "Alien",
                status: "",
                monitored: "",
                library: "",
                sort: "title",
                view: "list",
            }),
        });

        expect(result.props).toMatchObject({
            mediaType,
            query: "Alien",
            page: 1,
            detailsTitleId: undefined,
            status: undefined,
            monitored: null,
            libraryId: undefined,
            sort: "title",
            view: "list",
        });
    });
});
