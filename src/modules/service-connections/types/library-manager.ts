export type LibraryManagerServiceType = "sonarr" | "radarr";

const BYTES_PER_GB = 1024 ** 3;

export const MINIMUM_LIBRARY_REQUEST_FREE_SPACE_GB = 75;
export const MINIMUM_LIBRARY_REQUEST_FREE_SPACE_BYTES =
  MINIMUM_LIBRARY_REQUEST_FREE_SPACE_GB * BYTES_PER_GB;

export type LibraryManagerRootFolderSpace = {
  freeSpaceBytes?: number | null;
};

function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isLibraryManagerRootFolderBelowMinimumFreeSpace(
  rootFolder: LibraryManagerRootFolderSpace | null | undefined,
) {
  const freeSpaceBytes = rootFolder?.freeSpaceBytes;

  return (
    isByteCount(freeSpaceBytes) && freeSpaceBytes < MINIMUM_LIBRARY_REQUEST_FREE_SPACE_BYTES
  );
}

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