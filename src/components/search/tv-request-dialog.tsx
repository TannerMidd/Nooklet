"use client";

import { useEffect, useState } from "react";

import {
  loadTmdbTvSeasonEpisodesAction,
  loadTmdbTvSeasonsAction,
} from "@/app/(workspace)/search/actions";
import { Button } from "@/components/ui/button";
import {
  type TmdbTvEpisodeSummary,
  type TmdbTvSeasonSummary,
} from "@/modules/service-connections/adapters/tmdb";

export type TvSelectionState =
  | { mode: "all" }
  | { mode: "seasons"; seasons: number[] }
  | { mode: "episodes"; season: number; episodes: number[] };

type TvRequestDialogProps = {
  tmdbId: number;
  titleLabel: string;
  initialSelection: TvSelectionState;
  onConfirm: (selection: TvSelectionState) => void;
  onClose: () => void;
};

function summarizeSeasons(season: TmdbTvSeasonSummary) {
  if (season.seasonNumber === 0) {
    return "Specials";
  }

  return `Season ${season.seasonNumber}`;
}

export function TvRequestDialog({
  tmdbId,
  titleLabel,
  initialSelection,
  onConfirm,
  onClose,
}: TvRequestDialogProps) {
  const [mode, setMode] = useState<TvSelectionState["mode"]>(initialSelection.mode);
  const [seasons, setSeasons] = useState<TmdbTvSeasonSummary[]>([]);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(
    initialSelection.mode === "seasons" ? initialSelection.seasons : [],
  );
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    initialSelection.mode === "episodes" ? initialSelection.season : null,
  );
  const [episodes, setEpisodes] = useState<TmdbTvEpisodeSummary[]>([]);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>(
    initialSelection.mode === "episodes" ? initialSelection.episodes : [],
  );

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeasonsLoading(true);
    setSeasonsError(null);

    loadTmdbTvSeasonsAction(tmdbId).then((result) => {
      if (!active) return;

      if (result.ok) {
        setSeasons(result.seasons.filter((season) => season.seasonNumber !== null));
      } else {
        setSeasonsError(result.message);
      }

      setSeasonsLoading(false);
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

    loadTmdbTvSeasonEpisodesAction(tmdbId, selectedSeason).then((result) => {
      if (!active) return;

      if (result.ok) {
        setEpisodes(result.episodes);
      } else {
        setEpisodesError(result.message);
      }

      setEpisodesLoading(false);
    });

    return () => {
      active = false;
    };
  }, [mode, selectedSeason, tmdbId]);

  function toggleSeason(seasonNumber: number) {
    setSelectedSeasons((current) => (
      current.includes(seasonNumber)
        ? current.filter((value) => value !== seasonNumber)
        : [...current, seasonNumber].sort((a, b) => a - b)
    ));
  }

  function toggleEpisode(episodeNumber: number) {
    setSelectedEpisodes((current) => (
      current.includes(episodeNumber)
        ? current.filter((value) => value !== episodeNumber)
        : [...current, episodeNumber].sort((a, b) => a - b)
    ));
  }

  function handleConfirm() {
    if (mode === "all") {
      onConfirm({ mode: "all" });
      return;
    }

    if (mode === "seasons") {
      if (selectedSeasons.length === 0) {
        return;
      }
      onConfirm({ mode: "seasons", seasons: selectedSeasons });
      return;
    }

    if (selectedSeason === null || selectedEpisodes.length === 0) {
      return;
    }

    onConfirm({ mode: "episodes", season: selectedSeason, episodes: selectedEpisodes });
  }

  const confirmDisabled = mode === "seasons"
    ? selectedSeasons.length === 0
    : mode === "episodes"
      ? selectedSeason === null || selectedEpisodes.length === 0
      : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line/70 bg-panel-strong/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-lg text-foreground">Choose what to download</p>
            <p className="text-sm text-muted">{titleLabel}</p>
          </div>
          <Button variant="ghost" onClick={onClose} type="button">Close</Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {(["all", "seasons", "episodes"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={
                mode === value
                  ? "rounded-lg border border-accent/60 bg-accent/15 px-3 py-1.5 text-foreground"
                  : "rounded-lg border border-line/60 bg-background/20 px-3 py-1.5 text-muted"
              }
            >
              {value === "all" ? "Entire series" : value === "seasons" ? "Specific seasons" : "Specific episodes"}
            </button>
          ))}
        </div>

        {seasonsLoading ? (
          <p className="text-sm text-muted">Loading seasons…</p>
        ) : seasonsError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {seasonsError}
          </p>
        ) : null}

        {!seasonsLoading && !seasonsError && mode === "all" ? (
          <p className="text-sm text-muted">All available seasons and episodes will be requested.</p>
        ) : null}

        {!seasonsLoading && !seasonsError && mode === "seasons" ? (
          <ul className="space-y-1.5">
            {seasons.map((season) => (
              <li key={season.seasonNumber}>
                <label className="flex items-center gap-2 rounded-lg border border-line/50 bg-background/15 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={selectedSeasons.includes(season.seasonNumber!)}
                    onChange={() => toggleSeason(season.seasonNumber!)}
                  />
                  <span className="text-foreground">{summarizeSeasons(season)}</span>
                  {season.episodeCount ? (
                    <span className="text-xs text-muted">{season.episodeCount} episodes</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        {!seasonsLoading && !seasonsError && mode === "episodes" ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-foreground">Season</span>
              <select
                value={selectedSeason ?? ""}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number.parseInt(event.target.value, 10);
                  setSelectedSeason(value);
                  setSelectedEpisodes([]);
                }}
                className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-2 text-sm text-foreground"
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
                <p className="text-sm text-muted">Loading episodes…</p>
              ) : episodesError ? (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {episodesError}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {episodes.map((episode) => (
                    <li key={episode.episodeNumber}>
                      <label className="flex items-center gap-2 rounded-lg border border-line/50 bg-background/15 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-accent"
                          checked={selectedEpisodes.includes(episode.episodeNumber)}
                          onChange={() => toggleEpisode(episode.episodeNumber)}
                        />
                        <span className="text-foreground">
                          E{String(episode.episodeNumber).padStart(2, "0")} — {episode.name ?? "Episode"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleConfirm} disabled={confirmDisabled}>
            Use this selection
          </Button>
        </div>
      </div>
    </div>
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
