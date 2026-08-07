import { type MediaLibraryTvEpisodeSummary } from "@/modules/media-library/queries/get-media-library-tv-title-details";

export type LoadTvSeasonEpisodesResult =
    | { status: "ok"; episodes: MediaLibraryTvEpisodeSummary[] }
    | { status: "unauthorized" | "invalid" };
