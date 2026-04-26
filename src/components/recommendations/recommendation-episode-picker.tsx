"use client";

import { useActionState, useMemo, useState } from "react";

import { submitRecommendationEpisodeSelectionAction } from "@/app/(workspace)/recommendation-episode-actions";
import {
  initialRecommendationEpisodeSelectionActionState,
  type RecommendationEpisodeSelectionActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { Button } from "@/components/ui/button";
import { type SonarrEpisode } from "@/modules/service-connections/adapters/sonarr-episodes";

type RecommendationEpisodePickerProps = {
  itemId: string;
  returnTo: string;
  episodes: SonarrEpisode[];
};

function buildSeasonGroups(episodes: SonarrEpisode[]) {
  const seasons = new Map<number, SonarrEpisode[]>();

  for (const episode of episodes) {
    const bucket = seasons.get(episode.seasonNumber) ?? [];
    bucket.push(episode);
    seasons.set(episode.seasonNumber, bucket);
  }

  return Array.from(seasons.entries())
    .map(([seasonNumber, items]) => ({
      seasonNumber,
      label: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
      episodes: items.sort((left, right) => left.episodeNumber - right.episodeNumber),
    }))
    .sort((left, right) => left.seasonNumber - right.seasonNumber);
}

function formatAirDate(airDate: string | null) {
  if (!airDate) {
    return null;
  }

  try {
    const parsed = new Date(airDate);

    if (Number.isNaN(parsed.getTime())) {
      return airDate;
    }

    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return airDate;
  }
}

export function RecommendationEpisodePicker({
  itemId,
  returnTo,
  episodes,
}: RecommendationEpisodePickerProps) {
  const [state, formAction] = useActionState<
    RecommendationEpisodeSelectionActionState,
    FormData
  >(submitRecommendationEpisodeSelectionAction, initialRecommendationEpisodeSelectionActionState);

  const seasonGroups = useMemo(() => buildSeasonGroups(episodes), [episodes]);
  const initialSelection = useMemo(
    () => new Set(episodes.filter((episode) => episode.monitored).map((episode) => episode.id)),
    [episodes],
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(initialSelection);

  function toggleEpisode(episodeId: number) {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }

      return next;
    });
  }

  function setSeasonSelection(seasonNumber: number, monitored: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const seasonEpisodes = episodes.filter((episode) => episode.seasonNumber === seasonNumber);

      for (const episode of seasonEpisodes) {
        if (monitored) {
          next.add(episode.id);
        } else {
          next.delete(episode.id);
        }
      }

      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {Array.from(selectedIds).map((episodeId) => (
        <input key={episodeId} type="hidden" name="episodeIds" value={episodeId} />
      ))}

      <div className="rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm leading-6 text-muted">
        <span className="font-medium text-foreground">{selectedIds.size}</span>{" "}
        {selectedIds.size === 1 ? "episode" : "episodes"} selected to monitor.
      </div>

      <div className="space-y-5">
        {seasonGroups.map((group) => {
          const seasonEpisodeIds = new Set(group.episodes.map((episode) => episode.id));
          const selectedInSeason = group.episodes.filter((episode) =>
            selectedIds.has(episode.id),
          ).length;
          const allSelected = selectedInSeason === group.episodes.length && group.episodes.length > 0;

          return (
            <section
              key={group.seasonNumber}
              className="rounded-[28px] border border-line/70 bg-panel/80 p-5"
            >
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg text-foreground">{group.label}</h2>
                  <p className="text-sm text-muted">
                    {selectedInSeason} of {group.episodes.length} selected
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => setSeasonSelection(group.seasonNumber, true)}
                    disabled={allSelected}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => setSeasonSelection(group.seasonNumber, false)}
                    disabled={selectedInSeason === 0}
                  >
                    Clear
                  </Button>
                </div>
              </header>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {group.episodes.map((episode) => {
                  const isSelected = selectedIds.has(episode.id);
                  const airDate = formatAirDate(episode.airDate);

                  return (
                    <li key={episode.id}>
                      <label
                        className={`flex h-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 transition ${
                          isSelected
                            ? "border-accent/40 bg-accent/10 text-foreground"
                            : "border-line/70 bg-panel text-muted hover:bg-panel-strong/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEpisode(episode.id)}
                          className="mt-1 h-4 w-4 rounded border-line bg-panel text-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground">
                            {episode.episodeNumber}. {episode.title}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                            {airDate ? <span>{airDate}</span> : null}
                            {episode.hasFile ? (
                              <span className="rounded-full border border-line/70 px-2 py-0.5">Downloaded</span>
                            ) : null}
                            {episode.monitored ? (
                              <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent">
                                Currently monitored
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {seasonEpisodeIds.size === 0 ? (
                <p className="mt-4 text-sm text-muted">No episodes returned for this season.</p>
              ) : null}
            </section>
          );
        })}
      </div>

      {state.fieldErrors?.episodeIds ? (
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.fieldErrors.episodeIds}
        </p>
      ) : null}

      {state.status === "error" && state.message && !state.fieldErrors?.episodeIds ? (
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button type="submit" disabled={selectedIds.size === 0}>
          Save and search Sonarr
        </Button>
      </div>
    </form>
  );
}
