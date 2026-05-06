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

export type IndexerSearchActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  searchRunId: string | null;
  results: SearchResultView[];
};

export const initialIndexerSearchActionState: IndexerSearchActionState = {
  status: "idle",
  message: null,
  searchRunId: null,
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
