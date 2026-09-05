// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => navigation,
}));

vi.mock("./tv-request-dialog", () => ({
    TvRequestDialog: () => null,
    describeTvSelection: () => "Entire series",
}));

import { TitleRequestControls } from "./title-request-controls";

describe("TitleRequestControls", () => {
    afterEach(() => {
        cleanup();
        navigation.push.mockReset();
        window.history.replaceState({}, "", "/");
    });

    it("keeps the request summary current as the download behavior changes", () => {
        render(
            <TitleRequestControls
                mediaType="movie"
                tmdbId={null}
                titleLabel="Arrival"
                libraries={[{ id: "movies", name: "Movies", mediaType: "movie" }]}
                qualityProfiles={[{ value: "hd-1080p", label: "HD 1080p" }]}
                pathOptions={[
                    {
                        id: "movies-default",
                        libraryId: "movies",
                        libraryName: "Movies",
                        mediaType: "movie",
                        label: "Movies",
                        path: "F:/Movies",
                        isDownloadDefault: true,
                    },
                ]}
            />,
        );

        expect(screen.getByText("Arrival · Movie")).toBeInTheDocument();
        expect(screen.getByText("Add to catalog + download now")).toBeInTheDocument();
        expect(
            screen.getByText(/Nooklet will add this title, search indexers now/),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText("Add to library only"));

        expect(screen.getByText("Add to catalog only")).toBeInTheDocument();
        expect(
            screen.getByText(/without searching indexers or queueing a download/),
        ).toBeInTheDocument();
    });

    it("preserves media type and encoded request context in storage settings", () => {
        window.history.replaceState(
            {},
            "",
            "/search?type=movie&q=The%20Matrix%20%26%20More&sort=recent",
        );

        render(
            <TitleRequestControls
                mediaType="movie"
                tmdbId={null}
                titleLabel="Arrival"
                libraries={[{ id: "movies", name: "Movies", mediaType: "movie" }]}
                qualityProfiles={[{ value: "hd-1080p", label: "HD 1080p" }]}
                pathOptions={[]}
            />,
        );

        fireEvent.click(screen.getByRole("link", { name: "Open Storage settings" }));

        expect(navigation.push).toHaveBeenCalledTimes(1);
        const href = navigation.push.mock.calls[0]?.[0] as string;
        const url = new URL(href, "http://nooklet.test");

        expect(url.pathname).toBe("/settings/storage");
        expect(url.searchParams.get("mediaType")).toBe("movie");
        expect(url.searchParams.get("returnTo")).toBe(
            "/search?type=movie&q=The%20Matrix%20%26%20More&sort=recent",
        );
    });
});
