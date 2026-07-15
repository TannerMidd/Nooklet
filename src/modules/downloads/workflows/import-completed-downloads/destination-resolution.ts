import { resolveMediaLibraryDownloadTarget } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  resolveMediaLibraryImportItem,
  type ResolvedMediaLibraryImportItem,
} from "@/modules/media-library/queries/resolve-media-library-import-item";
import {
  listTvEpisodesForTitle,
  type TvEpisodeRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { type MatchedCompletedDownload } from "./request-matching";
import { resolveCompletedDownloadSourcePath } from "./source-path-mapping";

export type FailedCompletedDownloadResolution = {
  kind: "failed";
  match: MatchedCompletedDownload;
  message: string;
};

export type ImportableCompletedDownload = {
  kind: "importable";
  match: MatchedCompletedDownload;
  target: NonNullable<Awaited<ReturnType<typeof resolveMediaLibraryDownloadTarget>>>;
  title: ResolvedMediaLibraryImportItem["title"];
  episode: ResolvedMediaLibraryImportItem["episode"];
  /** Known episodes of the title, preloaded for season-pack file matching. */
  titleEpisodes: TvEpisodeRecord[];
  sourceRootPath: string;
};

export type ResolvedCompletedDownload = FailedCompletedDownloadResolution | ImportableCompletedDownload;

export async function resolveCompletedDownloadDestinations(
  userId: string,
  matches: MatchedCompletedDownload[],
  options: { sourcePathKind?: "sabnzbd" | "local" } = {},
): Promise<ResolvedCompletedDownload[]> {
  const resolvedDownloads: ResolvedCompletedDownload[] = [];

  for (const match of matches) {
    if (match.historyItem.statusKind === "failed") {
      resolvedDownloads.push({
        kind: "failed",
        match,
        message: match.historyItem.failMessage ?? "SABnzbd reported that the download failed.",
      });
      continue;
    }

    if (!match.historyItem.storagePath) {
      resolvedDownloads.push({
        kind: "failed",
        match,
        message: "SABnzbd did not report a completed download folder.",
      });
      continue;
    }

    if (!match.request.targetLibraryPathId) {
      resolvedDownloads.push({
        kind: "failed",
        match,
        message: "No destination library folder was selected for this download.",
      });
      continue;
    }

    const target = await resolveMediaLibraryDownloadTarget(userId, {
      pathId: match.request.targetLibraryPathId,
      mediaType: match.request.mediaType,
      libraryId: match.request.targetLibraryId,
    });

    if (!target) {
      resolvedDownloads.push({
        kind: "failed",
        match,
        message: "The selected destination library folder is no longer active.",
      });
      continue;
    }

    const importItem = await resolveMediaLibraryImportItem(userId, {
      titleId: match.request.mediaTitleId,
      episodeId: match.request.episodeId,
    });
    const titleEpisodes =
      match.request.mediaType === "tv" && !match.request.episodeId && match.request.mediaTitleId
        ? await listTvEpisodesForTitle(match.request.mediaTitleId)
        : [];

    try {
      resolvedDownloads.push({
        kind: "importable",
        match,
        target,
        title: importItem.title,
        episode: importItem.episode,
        titleEpisodes,
        sourceRootPath: await resolveCompletedDownloadSourcePath(
          match.historyItem.storagePath,
          { trustedLocalSource: options.sourcePathKind === "local" },
        ),
      });
    } catch (error) {
      resolvedDownloads.push({
        kind: "failed",
        match,
        message: error instanceof Error
          ? error.message
          : "The completed-download path could not be resolved safely.",
      });
    }
  }

  return resolvedDownloads;
}
