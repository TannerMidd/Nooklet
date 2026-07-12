"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadTvSeasonEpisodesForLibraryAction } from "@/app/(workspace)/library/actions";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { TvEpisodeMonitoringForm } from "@/app/(workspace)/library/tv-episode-monitoring-form";
import { TvSeasonMonitoringForm } from "@/app/(workspace)/library/tv-season-monitoring-form";
import { EmptyState } from "@/components/ui/empty-state";
import { type MediaLibraryTvEpisodeSummary } from "@/modules/media-library/queries/get-media-library-tv-title-details";
import { type MediaLibraryTvSeasonOverview } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type EpisodeFetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; episodes: MediaLibraryTvEpisodeSummary[] };

function qualityLabel(qualityLabels: string[]) {
  return qualityLabels.length > 0 ? qualityLabels.join(" / ") : "No quality tag";
}

function episodeCode(episode: MediaLibraryTvEpisodeSummary) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function SeasonAccordion({
  season,
  titleId,
  targetPathOptions,
  currentLibraryPathId,
  defaultOpen,
}: {
  season: MediaLibraryTvSeasonOverview;
  titleId: string;
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
  defaultOpen: boolean;
}) {
  const [state, setState] = useState<EpisodeFetchState>({ kind: "idle" });
  const loadingRef = useRef(false);

  const loadEpisodes = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }
    if (state.kind === "loaded" || state.kind === "loading") {
      return;
    }

    loadingRef.current = true;
    setState({ kind: "loading" });

    try {
      const result = await loadTvSeasonEpisodesForLibraryAction(titleId, season.seasonNumber);

      if (result.status === "ok") {
        setState({ kind: "loaded", episodes: result.episodes });
      } else {
        setState({ kind: "error", message: "Could not load episodes." });
      }
    } catch {
      setState({ kind: "error", message: "Could not load episodes." });
    } finally {
      loadingRef.current = false;
    }
  }, [season.seasonNumber, state.kind, titleId]);

  useEffect(() => {
    if (defaultOpen) {
      // loadEpisodes awaits a server action before calling setState, so the
      // effect body itself never updates state synchronously. The eslint rule
      // can't see through the async boundary, so suppress it here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadEpisodes();
    }
  }, [defaultOpen, loadEpisodes]);

  return (
    <details
      className="overflow-hidden rounded-lg border border-cream/[0.08] bg-cream/[0.03]"
      open={defaultOpen}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          void loadEpisodes();
        }
      }}
    >
      <summary className="cursor-pointer px-4 py-3 transition hover:bg-cream/[0.06]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-lg text-foreground">
            {season.title ?? `Season ${season.seasonNumber}`}
          </span>
          <span className="text-sm text-muted">
            {season.availableEpisodeCount} of {season.episodeCount} episodes available / {season.monitored ? "Monitored" : "Unmonitored"}
          </span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-cream/[0.08] px-4 py-3">
        <TvSeasonMonitoringForm seasonId={season.id} monitored={season.monitored} />
        <LibraryItemSearchForm
          titleId={titleId}
          seasonId={season.id}
          label="Search season"
          targetPathOptions={targetPathOptions}
          currentLibraryPathId={currentLibraryPathId}
        />
      </div>
      {state.kind === "loading" ? (
        <p className="border-t border-cream/[0.08] px-3 py-2 text-sm text-muted">Loading episodes...</p>
      ) : null}
      {state.kind === "error" ? (
        <p className="border-t border-cream/[0.08] px-3 py-2 text-sm text-accent-wine">{state.message}</p>
      ) : null}
      {state.kind === "loaded" ? (
        state.episodes.length === 0 ? (
          <p className="border-t border-cream/[0.08] px-3 py-2 text-sm text-muted">
            No episodes have been discovered for this season yet.
          </p>
        ) : (
          <ul className="divide-y divide-cream/[0.06] border-t border-cream/[0.08]">
            {state.episodes.map((episode) => {
              const updatedLabel = episode.lastFileModifiedAt ? episode.lastFileModifiedAt.toLocaleDateString() : null;

              return (
                <li key={episode.id} className="grid gap-3 px-3.5 py-2.5 text-sm xl:grid-cols-[120px_minmax(0,1fr)_minmax(260px,auto)] xl:items-start">
                  <span className="font-semibold text-foreground">{episodeCode(episode)}</span>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-foreground">{episode.title ?? `Episode ${episode.episodeNumber}`}</p>
                    <p className="text-xs text-muted">
                      {episode.fileCount} file{episode.fileCount === 1 ? "" : "s"} / {qualityLabel(episode.qualityLabels)}
                      {updatedLabel ? ` / ${updatedLabel}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted">
                      <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                        {episode.hasFile || episode.fileCount > 0 ? "Available" : "Missing"}
                      </span>
                      <span className="rounded-md border border-cream/[0.08] bg-cream/[0.03] px-1.5 py-0.5">
                        {episode.monitored ? "Monitored" : "Unmonitored"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <TvEpisodeMonitoringForm episodeId={episode.id} monitored={episode.monitored} />
                    <LibraryItemSearchForm
                      titleId={titleId}
                      episodeId={episode.id}
                      label="Search episode"
                      targetPathOptions={targetPathOptions}
                      currentLibraryPathId={currentLibraryPathId}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </details>
  );
}

export function TvSeasonsList({
  titleId,
  seasons,
  targetPathOptions,
  currentLibraryPathId,
}: {
  titleId: string;
  seasons: MediaLibraryTvSeasonOverview[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
}) {
  if (seasons.length === 0) {
    return <EmptyState message="No episodes have been discovered for this series yet." />;
  }

  return (
    <div className="space-y-3">
      {seasons.map((season) => (
        <SeasonAccordion
          key={season.id}
          season={season}
          titleId={titleId}
          targetPathOptions={targetPathOptions}
          currentLibraryPathId={currentLibraryPathId}
          defaultOpen={season.seasonNumber === 1}
        />
      ))}
    </div>
  );
}
