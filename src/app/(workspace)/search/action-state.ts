export type SearchResultView = {
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  qualityLabel: string | null;
  sizeBytes: number | null;
  publishedAt: string | null;
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
};

export type TitleSearchResultView = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  voteAverage: number | null;
};

export type TitleSearchActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  results: TitleSearchResultView[];
};

export const initialTitleSearchActionState: TitleSearchActionState = {
  status: "idle",
  message: null,
  results: [],
};

export type RequestSearchTitleActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  titleId: string | null;
  searchRunId: string | null;
  downloadRequestId: string | null;
  results: SearchResultView[];
};

export const initialRequestSearchTitleActionState: RequestSearchTitleActionState = {
  status: "idle",
  message: null,
  titleId: null,
  searchRunId: null,
  downloadRequestId: null,
  results: [],
};

export type QueueIndexerResultActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  downloadRequestId: string | null;
};

export const initialQueueIndexerResultActionState: QueueIndexerResultActionState = {
  status: "idle",
  message: null,
  downloadRequestId: null,
};
