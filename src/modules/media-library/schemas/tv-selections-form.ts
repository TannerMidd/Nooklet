import { type TvRequestSelections } from "./request-media-title";

/**
 * Parses the shared TV picker's hidden form fields (selectionMode,
 * selectedSeasons, selectedSeason, selectedEpisodes) into request selections.
 */
export function parseTvSelectionsFromFormData(formData: FormData): TvRequestSelections | undefined {
    const mode = formData.get("selectionMode");

    if (mode === "seasons") {
        const seasons = formData
            .getAll("selectedSeasons")
            .map((value) => Number.parseInt(String(value), 10))
            .filter((value) => Number.isFinite(value));

        if (seasons.length === 0) {
            return undefined;
        }

        return { mode: "seasons", seasons };
    }

    if (mode === "episodes") {
        const seasonValue = Number.parseInt(String(formData.get("selectedSeason") ?? ""), 10);
        const episodes = formData
            .getAll("selectedEpisodes")
            .map((value) => Number.parseInt(String(value), 10))
            .filter((value) => Number.isFinite(value));

        if (!Number.isFinite(seasonValue) || episodes.length === 0) {
            return undefined;
        }

        return { mode: "episodes", season: seasonValue, episodes };
    }

    if (mode === "all") {
        return { mode: "all" };
    }

    return undefined;
}
