export type LibraryManagerServiceType = "sonarr" | "radarr";

export type SonarrLibrarySeasonSummary = {
  seasonNumber: number;
  monitored: boolean;
  episodeCount: number;
  episodeFileCount: number;
};

export type SonarrLibrarySeries = {
  id: number;
  title: string;
  sortTitle: string;
  year: number | null;
  qualityProfileId: number | null;
  qualityProfileName: string | null;
  monitored: boolean;
  status: string | null;
  network: string | null;
  posterUrl: string | null;
  totalSeasonCount: number;
  monitoredSeasonCount: number;
  episodeCount: number;
  episodeFileCount: number;
  seasons: SonarrLibrarySeasonSummary[];
};

export type RadarrLibraryMovie = {
  id: number;
  title: string;
  sortTitle: string;
  year: number | null;
  qualityProfileId: number | null;
  qualityProfileName: string | null;
  monitored: boolean;
  status: string | null;
  hasFile: boolean;
  posterUrl: string | null;
  studio: string | null;
};

export type SampledLibraryTasteItem = {
  title: string;
  year: number | null;
  genres: string[];
};

export type LibrarySearchResult = {
  resultKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  availableSeasons: Array<{ seasonNumber: number; label: string }>;
};