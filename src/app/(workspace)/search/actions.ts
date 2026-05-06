"use server";

import { auth } from "@/auth";
import { searchIndexersInputSchema, searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";

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

export async function searchIndexersAction(
  _previous: IndexerSearchActionState,
  formData: FormData,
): Promise<IndexerSearchActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialIndexerSearchActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = searchIndexersInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    query: formData.get("query"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the search and try again.";
    return { ...initialIndexerSearchActionState, status: "error", message: firstIssue };
  }

  const search = await searchIndexersWorkflow(session.user.id, parsed.data);

  if (search.searchRun.status === "failed") {
    return {
      ...initialIndexerSearchActionState,
      status: "error",
      message: search.searchRun.errorMessage ?? "Indexer search failed.",
      searchRunId: search.searchRun.id,
    };
  }

  return {
    status: "success",
    message: `${search.results.length} result${search.results.length === 1 ? "" : "s"} found.`,
    searchRunId: search.searchRun.id,
    results: search.results.map((result) => ({
      id: result.id,
      title: result.title,
      mediaType: result.mediaType,
      qualityLabel: result.qualityLabel,
      sizeBytes: result.sizeBytes,
      publishedAt: result.publishedAt?.toISOString() ?? null,
      seeders: result.seeders,
      leechers: result.leechers,
      grabs: result.grabs,
    })),
  };
}
