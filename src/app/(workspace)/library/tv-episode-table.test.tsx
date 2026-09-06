// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
    loadEpisodes: vi.fn(),
    updateEpisode: vi.fn(),
    updateSeason: vi.fn(),
}));

vi.mock("@/app/(workspace)/library/actions", () => ({
    loadTvSeasonEpisodesForLibraryAction: actionMocks.loadEpisodes,
    updateTvEpisodeMonitoringAction: actionMocks.updateEpisode,
    updateTvSeasonMonitoringAction: actionMocks.updateSeason,
}));

vi.mock("@/app/(workspace)/library/library-item-search-form", () => ({
    LibraryItemSearchForm: ({ label }: { label: string }) => (
        <button type="button" aria-label={label}>
            {label}
        </button>
    ),
}));

import { TvEpisodeTable } from "./tv-episode-table";

const episodes = [
    {
        id: "aired-missing",
        seasonNumber: 1,
        episodeNumber: 1,
        title: "Aired episode",
        airDate: "2000-01-01",
        monitored: true,
        hasFile: false,
        fileCount: 0,
        qualityLabels: [],
        lastFileModifiedAt: null,
    },
    {
        id: "future-episode",
        seasonNumber: 1,
        episodeNumber: 2,
        title: "Future episode",
        airDate: "2099-01-03",
        monitored: true,
        hasFile: false,
        fileCount: 0,
        qualityLabels: [],
        lastFileModifiedAt: null,
    },
    {
        id: "unknown-date",
        seasonNumber: 1,
        episodeNumber: 3,
        title: "Unknown date episode",
        airDate: null,
        monitored: true,
        hasFile: false,
        fileCount: 0,
        qualityLabels: [],
        lastFileModifiedAt: null,
    },
];

const secondSeasonEpisodes = [
    {
        id: "second-season-episode",
        seasonNumber: 2,
        episodeNumber: 1,
        title: "Second season episode",
        airDate: "2000-01-01",
        monitored: true,
        hasFile: false,
        fileCount: 0,
        qualityLabels: [],
        lastFileModifiedAt: null,
    },
];

const seasons = [
    {
        id: "season-1",
        seasonNumber: 1,
        title: "Season 1",
        monitored: false,
        episodeCount: episodes.length,
        availableEpisodeCount: 0,
    },
    {
        id: "season-2",
        seasonNumber: 2,
        title: "Season 2",
        monitored: false,
        episodeCount: secondSeasonEpisodes.length,
        availableEpisodeCount: 0,
    },
];

function renderTable(tableSeasons = seasons) {
    return render(
        <TvEpisodeTable
            titleId="title-1"
            seasons={tableSeasons}
            targetPathOptions={[]}
            currentLibraryPathId={null}
        />,
    );
}

describe("TvEpisodeTable", () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        actionMocks.loadEpisodes.mockReset();
        actionMocks.updateEpisode.mockReset();
        actionMocks.updateSeason.mockReset();
        actionMocks.loadEpisodes.mockResolvedValue({ status: "ok", episodes });
        actionMocks.updateEpisode.mockResolvedValue({ status: "success", message: null });
        actionMocks.updateSeason.mockResolvedValue({ status: "success", message: null });
    });

    it("keeps future and unknown-date episodes out of Missing only", async () => {
        renderTable();

        await waitFor(() => expect(screen.getByText("Aired episode")).toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: "Missing only" }));

        expect(screen.getByText("Aired episode")).toBeInTheDocument();
        expect(screen.queryByText("Future episode")).not.toBeInTheDocument();
        expect(screen.queryByText("Unknown date episode")).not.toBeInTheDocument();
        expect(screen.getByText(/1 missing · 1 unaired · 1 unknown/)).toBeInTheDocument();
    });

    it("reports mixed bulk results and keeps failed rows selected for retry", async () => {
        actionMocks.updateEpisode.mockImplementation(async (_state: unknown, formData: FormData) =>
            formData.get("episodeId") === "aired-missing"
                ? { status: "success", message: null }
                : { status: "error", message: "Synthetic failure." },
        );
        renderTable();

        await waitFor(() => expect(screen.getByText("Aired episode")).toBeInTheDocument());

        const checkboxes = screen.getAllByRole("checkbox");

        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
        fireEvent.click(screen.getByRole("button", { name: /^Monitor$/ }));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(
                "1 episode updated. 1 episode failed: Synthetic failure.",
            );
            expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
            expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
            expect(screen.getByRole("button", { name: /^Retry monitor$/ })).toBeEnabled();
        });
    });

    it("does not announce a successful season update when the action fails", async () => {
        actionMocks.updateSeason.mockResolvedValue({
            status: "error",
            message: "Synthetic season failure.",
        });
        renderTable();

        await waitFor(() => expect(screen.getByText("Aired episode")).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Monitor season" }));

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("Synthetic season failure."),
        );
        expect(screen.queryByText("Season 1 monitored.")).not.toBeInTheDocument();
    });

    it("offers an in-place retry after a season load error", async () => {
        actionMocks.loadEpisodes
            .mockResolvedValueOnce({ status: "unauthorized" })
            .mockResolvedValueOnce({ status: "ok", episodes });
        renderTable();

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        await waitFor(() => expect(screen.getByText("Aired episode")).toBeInTheDocument());
        expect(actionMocks.loadEpisodes).toHaveBeenCalledTimes(2);
    });

    it("locks the season context until a deferred bulk update settles", async () => {
        let resolveUpdate: ((result: { status: "error"; message: string }) => void) | undefined;
        const updatePromise = new Promise<{ status: "error"; message: string }>((resolve) => {
            resolveUpdate = resolve;
        });

        actionMocks.loadEpisodes.mockImplementation(
            async (_titleId: string, seasonNumber: number) =>
                seasonNumber === 1
                    ? { status: "ok", episodes }
                    : { status: "ok", episodes: secondSeasonEpisodes },
        );
        actionMocks.updateEpisode.mockReturnValue(updatePromise);

        renderTable();

        await waitFor(() => expect(screen.getByText("Aired episode")).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        fireEvent.click(screen.getByRole("button", { name: /^Monitor$/ }));

        const secondSeasonButton = screen.getByRole("button", { name: /^S2/ });

        await waitFor(() => expect(secondSeasonButton).toBeDisabled());

        resolveUpdate?.({ status: "error", message: "Synthetic deferred failure." });

        await waitFor(() => {
            expect(secondSeasonButton).toBeEnabled();
            expect(screen.getByRole("button", { name: /^Retry monitor$/ })).toBeInTheDocument();
        });
        fireEvent.click(secondSeasonButton);

        await waitFor(() => expect(screen.getByText("Second season episode")).toBeInTheDocument());
        expect(screen.queryByText(/episode selected/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Retry monitor$/ })).not.toBeInTheDocument();
    });
});
