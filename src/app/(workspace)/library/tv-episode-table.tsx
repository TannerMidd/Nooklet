"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  loadTvSeasonEpisodesForLibraryAction,
  updateTvEpisodeMonitoringAction,
  updateTvSeasonMonitoringAction,
} from "@/app/(workspace)/library/actions";
import {
  initialTvEpisodeMonitoringActionState,
  initialTvSeasonMonitoringActionState,
} from "@/app/(workspace)/library/action-state";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { type MediaLibraryTvEpisodeSummary } from "@/modules/media-library/queries/get-media-library-tv-title-details";
import { type MediaLibraryTvSeasonOverview } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import { cn } from "@/lib/utils";

/** Column track shared by the header and every row so they stay aligned. */
const rowGrid =
  "grid grid-cols-[24px_62px_minmax(0,1fr)_88px_58px_44px] items-center gap-[11px] px-5";

type EpisodeFetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; episodes: MediaLibraryTvEpisodeSummary[] };

function episodeCode(episode: MediaLibraryTvEpisodeSummary) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function qualityLabel(episode: MediaLibraryTvEpisodeSummary) {
  if (!episode.hasFile && episode.fileCount === 0) {
    return "Missing";
  }
  return episode.qualityLabels.length > 0 ? episode.qualityLabels.join(" / ") : "Untagged";
}

export function TvEpisodeTable({
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
  const [activeSeasonNumber, setActiveSeasonNumber] = useState(
    seasons[0]?.seasonNumber ?? 1,
  );
  const [missingOnly, setMissingOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPending, startBulk] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  // Episodes are fetched per season and cached, so switching back to a season
  // already viewed does not re-hit the server.
  const [cache, setCache] = useState<Record<number, EpisodeFetchState>>({});
  const loadingRef = useRef<Set<number>>(new Set());

  const activeSeason = seasons.find((season) => season.seasonNumber === activeSeasonNumber)
    ?? seasons[0]
    ?? null;

  const loadSeason = useCallback(async (seasonNumber: number) => {
    if (loadingRef.current.has(seasonNumber)) {
      return;
    }

    loadingRef.current.add(seasonNumber);
    setCache((current) => ({ ...current, [seasonNumber]: { kind: "loading" } }));

    try {
      const result = await loadTvSeasonEpisodesForLibraryAction(titleId, seasonNumber);
      setCache((current) => ({
        ...current,
        [seasonNumber]: result.status === "ok"
          ? { kind: "loaded", episodes: result.episodes }
          : { kind: "error", message: "Could not load episodes." },
      }));
    } catch {
      setCache((current) => ({
        ...current,
        [seasonNumber]: { kind: "error", message: "Could not load episodes." },
      }));
    } finally {
      loadingRef.current.delete(seasonNumber);
    }
  }, [titleId]);

  useEffect(() => {
    if (!activeSeason) {
      return;
    }
    if (cache[activeSeason.seasonNumber]) {
      return;
    }
    // The action is awaited, so no state update happens synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeason(activeSeason.seasonNumber);
  }, [activeSeason, cache, loadSeason]);

  if (!activeSeason) {
    return (
      <p className="px-5 py-9 text-center text-[13px] text-muted">
        No episodes have been discovered for this series yet.
      </p>
    );
  }

  const state = cache[activeSeason.seasonNumber] ?? { kind: "idle" as const };
  const allEpisodes = state.kind === "loaded" ? state.episodes : [];
  const visibleEpisodes = missingOnly
    ? allEpisodes.filter((episode) => !episode.hasFile && episode.fileCount === 0)
    : allEpisodes;
  const missingCount = allEpisodes.filter((e) => !e.hasFile && e.fileCount === 0).length;
  const unmonitoredCount = allEpisodes.filter((e) => !e.monitored).length;

  /** Applies the existing per-episode action across the selection, in order. */
  const applyMonitoring = (monitored: boolean) => {
    const ids = [...selected];
    startBulk(async () => {
      setBulkMessage(null);
      for (const episodeId of ids) {
        const formData = new FormData();
        formData.set("episodeId", episodeId);
        if (monitored) {
          formData.set("monitored", "on");
        }
        await updateTvEpisodeMonitoringAction(initialTvEpisodeMonitoringActionState, formData);
      }
      setCache((current) => {
        const seasonState = current[activeSeason.seasonNumber];
        if (seasonState?.kind !== "loaded") return current;
        return {
          ...current,
          [activeSeason.seasonNumber]: {
            kind: "loaded",
            episodes: seasonState.episodes.map((episode) => (
              ids.includes(episode.id) ? { ...episode, monitored } : episode
            )),
          },
        };
      });
      setSelected([]);
      setBulkMessage(`${ids.length} ${ids.length === 1 ? "episode" : "episodes"} ${monitored ? "monitored" : "unmonitored"}.`);
    });
  };

  const toggleSeasonMonitoring = () => {
    startBulk(async () => {
      setBulkMessage(null);
      const formData = new FormData();
      formData.set("seasonId", activeSeason.id);
      if (!activeSeason.monitored) {
        formData.set("monitored", "on");
      }
      await updateTvSeasonMonitoringAction(initialTvSeasonMonitoringActionState, formData);
      setBulkMessage(
        `Season ${activeSeason.seasonNumber} ${activeSeason.monitored ? "unmonitored" : "monitored"}.`,
      );
    });
  };

  return (
    <>
      {/* Season chips */}
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-cream/[0.06] px-5 py-3.5">
        {seasons.map((season) => {
          const active = season.seasonNumber === activeSeason.seasonNumber;
          const seasonMissing = season.episodeCount - season.availableEpisodeCount;

          return (
            <button
              key={season.id}
              type="button"
              onClick={() => {
                setActiveSeasonNumber(season.seasonNumber);
                setSelected([]);
                setBulkMessage(null);
              }}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex shrink-0 items-baseline gap-[7px] rounded-[9px] border px-[13px] py-2 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                active
                  ? "border-accent/55 bg-accent/[0.13] text-accent"
                  : "border-cream/[0.09] bg-cream/[0.03] text-foreground hover:border-cream/[0.16]",
              )}
            >
              <span>S{season.seasonNumber}</span>
              <span
                className={cn(
                  "text-[11.5px] font-medium",
                  active ? "text-accent/75" : seasonMissing > 0 ? "text-accent" : "text-muted",
                )}
              >
                {season.availableEpisodeCount}/{season.episodeCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Season header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3.5 border-b border-cream/[0.06] px-5 py-3">
        <div className="min-w-0">
          <p className="font-heading text-[18px] leading-[1.15] text-foreground">
            {activeSeason.title ?? `Season ${activeSeason.seasonNumber}`}
          </p>
          <p className="mt-[3px] text-xs text-muted">
            {[
              `${activeSeason.episodeCount} episodes`,
              `${activeSeason.availableEpisodeCount} available`,
              missingCount > 0 ? `${missingCount} missing` : null,
              unmonitoredCount > 0 ? `${unmonitoredCount} unmonitored` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMissingOnly((current) => !current)}
            aria-pressed={missingOnly}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-[13px] text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              missingOnly
                ? "border-accent/50 bg-accent/[0.12] text-accent"
                : "border-cream/[0.12] text-muted hover:text-foreground",
            )}
          >
            Missing only
          </button>
          <button
            type="button"
            onClick={toggleSeasonMonitoring}
            disabled={bulkPending}
            className="inline-flex min-h-11 items-center rounded-full border border-cream/[0.14] bg-cream/[0.04] px-[13px] text-[12.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
          >
            {activeSeason.monitored ? "Unmonitor season" : "Monitor season"}
          </button>
          <LibraryItemSearchForm
            titleId={titleId}
            seasonId={activeSeason.id}
            label="Search season"
            targetPathOptions={targetPathOptions}
            currentLibraryPathId={currentLibraryPathId}
            compact
          />
        </div>
      </div>

      {/* Column header */}
      <div
        className={cn(
          rowGrid,
          "h-8 shrink-0 border-b border-cream/[0.06] text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted/75",
        )}
      >
        <span />
        <span>Ep</span>
        <span>Title</span>
        <span>Quality</span>
        <span>Added</span>
        <span />
      </div>

      {/* Rows */}
      <div className="relative min-h-0 flex-1 overflow-auto pb-[72px]">
        {state.kind === "loading" || state.kind === "idle" ? (
          <p className="px-5 py-9 text-center text-[13px] text-muted">Loading episodes…</p>
        ) : null}
        {state.kind === "error" ? (
          <p className="px-5 py-9 text-center text-[13px] text-accent-wine">{state.message}</p>
        ) : null}
        {state.kind === "loaded" && visibleEpisodes.length === 0 ? (
          <p className="px-5 py-9 text-center text-[13px] text-muted">
            {missingOnly
              ? "Every episode in this season is on disk."
              : "No episodes have been discovered for this season yet."}
          </p>
        ) : null}

        {visibleEpisodes.map((episode) => {
          const checked = selected.includes(episode.id);
          const missing = !episode.hasFile && episode.fileCount === 0;

          return (
            <div
              key={episode.id}
              className={cn(
                rowGrid,
                "min-h-11 border-b border-cream/[0.045] transition",
                checked ? "bg-accent/[0.08]" : "hover:bg-cream/[0.035]",
                episode.monitored ? null : "opacity-[0.62]",
              )}
            >
              <label className="inline-flex min-h-11 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelected((current) => (
                    current.includes(episode.id)
                      ? current.filter((id) => id !== episode.id)
                      : [...current, episode.id]
                  ))}
                  className="peer sr-only"
                />
                <span className="sr-only">Select {episodeCode(episode)}</span>
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-cream/[0.22] transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-focus"
                >
                  {checked ? <Check aria-hidden="true" size={11} className="text-accent-foreground" /> : null}
                </span>
              </label>
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums tracking-[0.02em]",
                  missing ? "text-accent" : "text-muted",
                )}
              >
                {episodeCode(episode)}
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[13.5px] text-foreground">
                  {episode.title ?? `Episode ${episode.episodeNumber}`}
                </span>
                {episode.monitored ? null : (
                  <span className="shrink-0 text-[11px] text-muted/85">unmonitored</span>
                )}
              </span>
              <span
                className={cn(
                  "truncate text-[12.5px]",
                  missing ? "font-semibold text-accent" : "text-muted",
                )}
              >
                {qualityLabel(episode)}
              </span>
              <span className="text-[12.5px] text-muted">
                {episode.lastFileModifiedAt
                  ? episode.lastFileModifiedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "—"}
              </span>
              <LibraryItemSearchForm
                titleId={titleId}
                episodeId={episode.id}
                label={`Search ${episodeCode(episode)}`}
                targetPathOptions={targetPathOptions}
                currentLibraryPathId={currentLibraryPathId}
                compact
              />
            </div>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 ? (
        <div className="nk-rise absolute bottom-[18px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-cream/[0.14] bg-panel-raised py-1 pl-[18px] pr-2 shadow-[0_22px_44px_-18px_rgba(0,0,0,0.95)]">
          <span className="mr-1.5 text-[13px] font-semibold text-foreground">
            {selected.length} {selected.length === 1 ? "episode" : "episodes"} selected
          </span>
          <button
            type="button"
            onClick={() => applyMonitoring(true)}
            disabled={bulkPending}
            className="nk-button-primary inline-flex min-h-11 items-center rounded-full px-3.5 text-[12.5px] disabled:opacity-60"
          >
            {bulkPending ? "Working…" : "Monitor"}
          </button>
          <button
            type="button"
            onClick={() => applyMonitoring(false)}
            disabled={bulkPending}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-[12.5px] font-semibold text-foreground transition hover:bg-cream/[0.08] disabled:opacity-60"
          >
            Unmonitor
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            aria-label="Clear selection"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-cream/[0.08] hover:text-foreground"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}

      {bulkMessage ? (
        <p role="status" className="shrink-0 border-t border-cream/[0.06] px-5 py-2 text-xs text-muted">
          {bulkMessage}
        </p>
      ) : null}
    </>
  );
}
