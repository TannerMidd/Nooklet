"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  loadTmdbTvSeasonEpisodesAction,
  loadTmdbTvSeasonsAction,
} from "@/app/(workspace)/search/actions";
import { Button } from "@/components/ui/button";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import {
  type TmdbTvEpisodeSummary,
  type TmdbTvSeasonSummary,
} from "@/modules/service-connections/adapters/tmdb";

export type TvSelectionState =
  | { mode: "all" }
  | { mode: "seasons"; seasons: number[] }
  | { mode: "episodes"; season: number; episodes: number[] };

type TvRequestPickerProps = {
  tmdbId: number;
  selection: TvSelectionState | null;
  onSelectionChange: (selection: TvSelectionState | null) => void;
  monitoredSeasons?: readonly number[];
  monitoredEpisodes?: readonly { season: number; episode: number }[];
};

function summarizeSeasons(season: TmdbTvSeasonSummary) {
  if (season.seasonNumber === 0) {
    return "Specials";
  }

  return `Season ${season.seasonNumber}`;
}

export function TvRequestPicker({
  tmdbId,
  selection,
  onSelectionChange,
  monitoredSeasons = [],
  monitoredEpisodes = [],
}: TvRequestPickerProps) {
  const [mode, setMode] = useState<TvSelectionState["mode"]>(selection?.mode ?? "seasons");
  const [seasons, setSeasons] = useState<TmdbTvSeasonSummary[]>([]);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(
    selection?.mode === "seasons" ? selection.seasons : [],
  );
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    selection?.mode === "episodes" ? selection.season : null,
  );
  const [episodes, setEpisodes] = useState<TmdbTvEpisodeSummary[]>([]);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>(
    selection?.mode === "episodes" ? selection.episodes : [],
  );

  const monitoredSet = useMemo(() => new Set(monitoredSeasons), [monitoredSeasons]);
  const monitoredEpisodeSet = useMemo(
    () => new Set(monitoredEpisodes.map((entry) => `${entry.season}:${entry.episode}`)),
    [monitoredEpisodes],
  );

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeasonsLoading(true);
    setSeasonsError(null);

    void loadTmdbTvSeasonsAction(tmdbId)
      .then((result) => {
        if (!active) return;

        if (result.ok) {
          setSeasons(result.seasons.filter((season) => season.seasonNumber !== null));
        } else {
          setSeasonsError(result.message);
        }
      })
      .catch(() => {
        if (active) {
          setSeasonsError("Nooklet could not load seasons right now.");
        }
      })
      .finally(() => {
        if (active) {
          setSeasonsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tmdbId]);

  useEffect(() => {
    if (mode !== "episodes" || selectedSeason === null) {
      return;
    }

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEpisodesLoading(true);
    setEpisodesError(null);

    void loadTmdbTvSeasonEpisodesAction(tmdbId, selectedSeason)
      .then((result) => {
        if (!active) return;

        if (result.ok) {
          setEpisodes(result.episodes);
        } else {
          setEpisodesError(result.message);
        }
      })
      .catch(() => {
        if (active) {
          setEpisodesError("Nooklet could not load episodes right now.");
        }
      })
      .finally(() => {
        if (active) {
          setEpisodesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, selectedSeason, tmdbId]);

  function emit(next: TvSelectionState | null) {
    onSelectionChange(next);
  }

  function changeMode(nextMode: TvSelectionState["mode"]) {
    setMode(nextMode);

    if (nextMode === "all") {
      emit({ mode: "all" });
      return;
    }

    if (nextMode === "seasons") {
      emit(selectedSeasons.length > 0 ? { mode: "seasons", seasons: selectedSeasons } : null);
      return;
    }

    if (selectedSeason !== null && selectedEpisodes.length > 0) {
      emit({ mode: "episodes", season: selectedSeason, episodes: selectedEpisodes });
    } else {
      emit(null);
    }
  }

  function toggleSeason(seasonNumber: number) {
    if (monitoredSet.has(seasonNumber)) {
      return;
    }

    setSelectedSeasons((current) => {
      const next = current.includes(seasonNumber)
        ? current.filter((value) => value !== seasonNumber)
        : [...current, seasonNumber].sort((a, b) => a - b);

      emit(next.length > 0 ? { mode: "seasons", seasons: next } : null);
      return next;
    });
  }

  function selectAllSeasons() {
    const next = seasons
      .map((season) => season.seasonNumber)
      .filter((seasonNumber): seasonNumber is number => seasonNumber !== null && !monitoredSet.has(seasonNumber));

    setSelectedSeasons(next);
    emit(next.length > 0 ? { mode: "seasons", seasons: next } : null);
  }

  function clearSeasons() {
    setSelectedSeasons([]);
    emit(null);
  }

  function pickEpisodeSeason(value: number | null) {
    setSelectedSeason(value);
    setSelectedEpisodes([]);
    emit(null);
  }

  function toggleEpisode(episodeNumber: number) {
    if (
      selectedSeason !== null &&
      monitoredEpisodeSet.has(`${selectedSeason}:${episodeNumber}`)
    ) {
      return;
    }

    setSelectedEpisodes((current) => {
      const next = current.includes(episodeNumber)
        ? current.filter((value) => value !== episodeNumber)
        : [...current, episodeNumber].sort((a, b) => a - b);

      if (selectedSeason !== null && next.length > 0) {
        emit({ mode: "episodes", season: selectedSeason, episodes: next });
      } else {
        emit(null);
      }

      return next;
    });
  }

  function selectAllEpisodes() {
    if (selectedSeason === null) {
      return;
    }

    const next = episodes
      .map((episode) => episode.episodeNumber)
      .filter((episodeNumber) => !monitoredEpisodeSet.has(`${selectedSeason}:${episodeNumber}`));

    setSelectedEpisodes(next);
    emit(next.length > 0 ? { mode: "episodes", season: selectedSeason, episodes: next } : null);
  }

  function clearEpisodes() {
    setSelectedEpisodes([]);
    emit(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="TV download selection mode">
        {(["all", "seasons", "episodes"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => changeMode(value)}
            className={
              mode === value
                ? "min-h-11 rounded-lg border border-accent/60 bg-accent/15 px-3 py-2 text-foreground"
                : "min-h-11 rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-muted"
            }
          >
            {value === "all" ? "Entire series" : value === "seasons" ? "Specific seasons" : "Specific episodes"}
          </button>
        ))}
      </div>

      {seasonsLoading ? (
        <p className="text-sm text-muted" role="status">Loading seasons…</p>
      ) : seasonsError ? (
          <p className="rounded-lg border border-accent-wine/40 bg-accent-wine/10 px-3 py-2 text-sm text-foreground" role="alert">
          {seasonsError}
        </p>
      ) : null}

      {!seasonsLoading && !seasonsError && mode === "all" ? (
        <p className="text-sm text-muted">
          Every regular season will get its own recovery plan: Nooklet tries season packs first, retries alternatives, then fills remaining episodes individually.
        </p>
      ) : null}

      {!seasonsLoading && !seasonsError && mode === "seasons" ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {selectedSeasons.length} season{selectedSeasons.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={selectAllSeasons}>
                Select all available
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSeasons} disabled={selectedSeasons.length === 0}>
                Clear
              </Button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {seasons.map((season) => {
            const seasonNumber = season.seasonNumber!;
            const alreadyMonitored = monitoredSet.has(seasonNumber);

            return (
              <li key={seasonNumber}>
                <label
                  className={
                    alreadyMonitored
                      ? "flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.08] bg-background/10 px-3 py-2 text-sm opacity-60"
                      : "flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-sm"
                  }
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-accent"
                    checked={alreadyMonitored || selectedSeasons.includes(seasonNumber)}
                    disabled={alreadyMonitored}
                    onChange={() => toggleSeason(seasonNumber)}
                  />
                  <span className="text-foreground">{summarizeSeasons(season)}</span>
                  {season.episodeCount ? (
                    <span className="text-xs text-muted">{season.episodeCount} episodes</span>
                  ) : null}
                  {alreadyMonitored ? (
                    <span className="ml-auto rounded-md border border-cream/[0.08] bg-cream/[0.03] px-2 py-0.5 text-xs text-muted">
                      Monitored
                    </span>
                  ) : null}
                </label>
              </li>
            );
            })}
          </ul>
        </div>
      ) : null}

      {!seasonsLoading && !seasonsError && mode === "episodes" ? (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">Season</span>
            <select
              value={selectedSeason ?? ""}
              onChange={(event) => {
                const value = event.target.value === "" ? null : Number.parseInt(event.target.value, 10);
                pickEpisodeSeason(value);
              }}
              className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-foreground"
            >
              <option value="">Pick a season…</option>
              {seasons.map((season) => (
                <option key={season.seasonNumber} value={season.seasonNumber!}>
                  {summarizeSeasons(season)}
                </option>
              ))}
            </select>
          </label>

          {selectedSeason !== null ? (
            episodesLoading ? (
              <p className="text-sm text-muted" role="status">Loading episodes…</p>
            ) : episodesError ? (
              <p role="alert" className="rounded-lg border border-accent-wine/40 bg-accent-wine/10 px-3 py-2 text-sm text-foreground">
                {episodesError}
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted" aria-live="polite">
                    {selectedEpisodes.length} episode{selectedEpisodes.length === 1 ? "" : "s"} selected
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={selectAllEpisodes}>
                      Select all available
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearEpisodes} disabled={selectedEpisodes.length === 0}>
                      Clear
                    </Button>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {episodes.map((episode) => {
                  const alreadyMonitored =
                    selectedSeason !== null &&
                    monitoredEpisodeSet.has(`${selectedSeason}:${episode.episodeNumber}`);

                  return (
                    <li key={episode.episodeNumber}>
                      <label
                        className={
                          alreadyMonitored
                            ? "flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.08] bg-background/10 px-3 py-2 text-sm opacity-60"
                            : "flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-sm"
                        }
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-accent"
                          checked={alreadyMonitored || selectedEpisodes.includes(episode.episodeNumber)}
                          disabled={alreadyMonitored}
                          onChange={() => toggleEpisode(episode.episodeNumber)}
                        />
                        <span className="text-foreground">
                          E{String(episode.episodeNumber).padStart(2, "0")} — {episode.name ?? "Episode"}
                        </span>
                        {alreadyMonitored ? (
                          <span className="ml-auto rounded-md border border-cream/[0.08] bg-cream/[0.03] px-2 py-0.5 text-xs text-muted">
                            Monitored
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                  })}
                </ul>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type TvRequestDialogProps = {
  tmdbId: number;
  titleLabel: string;
  initialSelection: TvSelectionState;
  onConfirm: (selection: TvSelectionState) => void;
  onClose: () => void;
};

export function TvRequestDialog({
  tmdbId,
  titleLabel,
  initialSelection,
  onConfirm,
  onClose,
}: TvRequestDialogProps) {
  const [selection, setSelection] = useState<TvSelectionState | null>(initialSelection);
  const portalTarget = usePortalTarget();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useModalDialog({
    onClose,
    initialFocusRef: closeButtonRef,
    enabled: portalTarget !== null,
  });

  function handleConfirm() {
    if (!selection) {
      return;
    }
    onConfirm(selection);
  }

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-center justify-center nk-scrim nk-fade p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="nk-pop flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] border border-cream/[0.10] bg-[rgb(23,21,19)] shadow-[0_44px_90px_-44px_rgba(0,0,0,0.95)] sm:max-h-[85vh]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-cream/[0.08] p-4 sm:p-5">
          <div>
            <p id={titleId} className="font-heading text-[19px] text-foreground">Choose what to download</p>
            <p className="text-sm text-muted">{titleLabel}</p>
          </div>
          <Button ref={closeButtonRef} variant="ghost" onClick={onClose} type="button">Close</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <TvRequestPicker tmdbId={tmdbId} selection={selection} onSelectionChange={setSelection} />
        </div>

        <div className="flex flex-col gap-3 border-t border-cream/[0.08] bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">
            <p className="text-xs font-medium text-muted">Selected request</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {selection ? describeTvSelection(selection) : "Choose at least one season or episode"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 sm:flex-none" variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 sm:flex-none" type="button" onClick={handleConfirm} disabled={!selection}>
              Use this selection
            </Button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

export function describeTvSelection(selection: TvSelectionState): string {
  if (selection.mode === "all") {
    return "Entire series";
  }

  if (selection.mode === "seasons") {
    if (selection.seasons.length === 1) {
      return `Season ${selection.seasons[0]}`;
    }
    return `${selection.seasons.length} seasons selected`;
  }

  if (selection.episodes.length === 1) {
    return `S${String(selection.season).padStart(2, "0")}E${String(selection.episodes[0]).padStart(2, "0")}`;
  }

  return `Season ${selection.season} · ${selection.episodes.length} episodes`;
}
