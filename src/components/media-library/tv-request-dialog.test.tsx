// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
    loadSeasons: vi.fn(),
    loadEpisodes: vi.fn(),
}));

vi.mock("@/app/(workspace)/search/actions", () => ({
    loadTmdbTvSeasonsAction: actionMocks.loadSeasons,
    loadTmdbTvSeasonEpisodesAction: actionMocks.loadEpisodes,
}));

import { TvRequestPicker } from "./tv-request-dialog";

describe("TvRequestPicker", () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        actionMocks.loadSeasons.mockReset();
        actionMocks.loadEpisodes.mockReset();
        actionMocks.loadSeasons.mockResolvedValue({
            ok: true,
            seasons: [
                {
                    seasonNumber: 1,
                    name: "Season 1",
                    overview: null,
                    episodeCount: 1,
                    airDate: null,
                    posterUrl: null,
                },
            ],
        });
    });

    it("retries an episode load in place after an error", async () => {
        actionMocks.loadEpisodes
            .mockResolvedValueOnce({ ok: false, message: "Synthetic episode failure." })
            .mockResolvedValueOnce({
                ok: true,
                seasonNumber: 1,
                episodes: [
                    {
                        seasonNumber: 1,
                        episodeNumber: 1,
                        name: "Pilot",
                        overview: null,
                        airDate: "2000-01-01",
                        runtimeMinutes: 42,
                    },
                ],
            });

        render(
            <TvRequestPicker
                tmdbId={42}
                selection={{ mode: "episodes", season: 1, episodes: [] }}
                onSelectionChange={vi.fn()}
            />,
        );

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument(),
        );
        expect(screen.getByRole("alert")).toHaveTextContent("Synthetic episode failure.");

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await waitFor(() => expect(screen.getByText("Pilot")).toBeInTheDocument());
        expect(actionMocks.loadEpisodes).toHaveBeenCalledTimes(2);
    });
});
