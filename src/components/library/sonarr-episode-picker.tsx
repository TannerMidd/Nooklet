"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  initialSonarrLibraryActionState,
  type SonarrLibraryActionState,
} from "@/app/(workspace)/sonarr-library-action-state";
import {
  loadSonarrSeriesEpisodesForLibraryAction,
  submitSonarrSeriesEpisodeMonitoringAction,
} from "@/app/(workspace)/sonarr-library-actions";
import { Button } from "@/components/ui/button";
import { type SonarrEpisode } from "@/modules/service-connections/adapters/sonarr-episodes";

export type EpisodeLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: SonarrEpisode[] }
  | { status: "error"; message: string };

export function formatSeasonLabel(seasonNumber: number) {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
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

function buildSeasonGroups(episodes: SonarrEpisode[]) {
  const groups = new Map<number, SonarrEpisode[]>();

  for (const episode of episodes) {
    const bucket = groups.get(episode.seasonNumber) ?? [];
    bucket.push(episode);
    groups.set(episode.seasonNumber, bucket);
  }

  return Array.from(groups.entries())
    .map(([seasonNumber, items]) => ({
      seasonNumber,
      label: formatSeasonLabel(seasonNumber),
      episodes: items.sort(
        (left, right) => left.episodeNumber - right.episodeNumber,
      ),
    }))
    .sort((left, right) => left.seasonNumber - right.seasonNumber);
}

/**
 * Loads Sonarr episodes for a series via a server action with a guarded state machine.
 * Use the returned `loadEpisodesIfNeeded` from a click handler or effect to kick off
 * the fetch; the returned `loadState` reflects the lifecycle.
 */
export function useSonarrEpisodeLoader(seriesId: number) {
  const [loadState, setLoadState] = useState<EpisodeLoadState>({ status: "idle" });
  // Mirror loadState in a ref so the imperative loader can read the latest
  // status synchronously without relying on the queued setState updater
  // (which only runs during the next render).
  const loadStateRef = useRef(loadState);
  loadStateRef.current = loadState;

  function loadEpisodesIfNeeded() {
    const current = loadStateRef.current;
    if (current.status === "loading" || current.status === "loaded") {
      return;
    }

    loadStateRef.current = { status: "loading" };
    setLoadState({ status: "loading" });

    // Defer the server-action invocation out of the React commit phase so the
    // implicit Router state update it triggers does not collide with our render.
    queueMicrotask(() => {
      void loadSonarrSeriesEpisodesForLibraryAction(seriesId)
        .then((result) => {
          if (result.ok) {
            setLoadState({ status: "loaded", episodes: result.episodes });
          } else {
            setLoadState({ status: "error", message: result.message });
          }
        })
        .catch((error: unknown) => {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load episodes from Sonarr.",
          });
        });
    });
  }

  function reset() {
    loadStateRef.current = { status: "idle" };
    setLoadState({ status: "idle" });
  }

  return { loadState, loadEpisodesIfNeeded, reset };
}

type SonarrEpisodePickerFormProps = {
  seriesId: number;
  returnTo: string;
  loadState: EpisodeLoadState;
  onRetry: () => void;
  onCancel: () => void;
  onSuccess: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  /** Optional intro shown above the picker (e.g. after-add helper text). */
  intro?: React.ReactNode;
  /**
   * Override the default submit action. Defaults to
   * `submitSonarrSeriesEpisodeMonitoringAction` (library "Manage seasons" flow).
   * For the recommendations post-add flow, pass the recommendation finalize action
   * so item metadata is cleared on success.
   */
  submitAction?: (
    state: SonarrLibraryActionState,
    formData: FormData,
  ) => Promise<SonarrLibraryActionState>;
  /** Extra hidden form fields (e.g. `itemId` for the recommendations finalize action). */
  extraHiddenFields?: ReadonlyArray<{ name: string; value: string }>;
};

export function SonarrEpisodePickerForm({
  seriesId,
  returnTo,
  loadState,
  onRetry,
  onCancel,
  onSuccess,
  cancelLabel = "Cancel",
  submitLabel = "Save episode monitoring",
  intro,
  submitAction = submitSonarrSeriesEpisodeMonitoringAction,
  extraHiddenFields,
}: SonarrEpisodePickerFormProps) {
  const [state, formAction] = useActionState<SonarrLibraryActionState, FormData>(
    submitAction,
    initialSonarrLibraryActionState,
  );
  const [isPending, startTransition] = useTransition();

  const episodes = loadState.status === "loaded" ? loadState.episodes : [];
  const seasonGroups = useMemo(() => buildSeasonGroups(episodes), [episodes]);

  const initialSelection = useMemo(
    () =>
      new Set(
        episodes.filter((episode) => episode.monitored).map((episode) => episode.id),
      ),
    [episodes],
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());

  // Reset selection to current Sonarr state whenever a new episode list arrives.
  useEffect(() => {
    if (loadState.status === "loaded") {
      setSelectedIds(new Set(initialSelection));
      const expanded = new Set<number>();
      for (const group of seasonGroups) {
        if (group.episodes.some((episode) => initialSelection.has(episode.id))) {
          expanded.add(group.seasonNumber);
        }
      }
      setExpandedSeasons(expanded);
    }
  }, [loadState.status, initialSelection, seasonGroups]);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
      const seasonEpisodes = episodes.filter(
        (episode) => episode.seasonNumber === seasonNumber,
      );
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

  function toggleExpanded(seasonNumber: number) {
    setExpandedSeasons((previous) => {
      const next = new Set(previous);
      if (next.has(seasonNumber)) {
        next.delete(seasonNumber);
      } else {
        next.add(seasonNumber);
      }
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    formData.delete("episodeIds");
    for (const episodeId of selectedIds) {
      formData.append("episodeIds", String(episodeId));
    }
    startTransition(() => {
      formAction(formData);
    });
  }

  if (loadState.status === "loading" || loadState.status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted">
        Loading episodes from Sonarr…
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 px-6 py-8">
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {loadState.message}
        </p>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="seriesId" value={seriesId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {extraHiddenFields?.map((field) => (
        <input
          key={field.name}
          type="hidden"
          name={field.name}
          value={field.value}
        />
      ))}

      {intro ? <div className="px-6 pt-4">{intro}</div> : null}

      <div className="px-6 pt-4 text-xs text-muted">
        <span className="font-medium text-foreground">{selectedIds.size}</span>{" "}
        {selectedIds.size === 1 ? "episode" : "episodes"} selected to monitor.
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-6 pb-2">
        {seasonGroups.length === 0 ? (
          <p className="rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm text-muted">
            Sonarr returned no episodes for this series yet.
          </p>
        ) : (
          seasonGroups.map((group) => {
            const expanded = expandedSeasons.has(group.seasonNumber);
            const selectedInSeason = group.episodes.filter((episode) =>
              selectedIds.has(episode.id),
            ).length;
            const allSelected =
              group.episodes.length > 0 && selectedInSeason === group.episodes.length;
            const someSelected = selectedInSeason > 0 && !allSelected;

            return (
              <section
                key={group.seasonNumber}
                className="overflow-hidden rounded-2xl border border-line/70 bg-panel-strong/40"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-line accent-accent"
                      checked={allSelected}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate = someSelected;
                        }
                      }}
                      onChange={(event) =>
                        setSeasonSelection(group.seasonNumber, event.target.checked)
                      }
                    />
                    <span>{group.label}</span>
                    <span className="text-xs font-normal text-muted">
                      {selectedInSeason}/{group.episodes.length} selected
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.seasonNumber)}
                    aria-expanded={expanded}
                    className="rounded-full border border-line/70 bg-panel px-3 py-1 text-xs font-semibold text-muted hover:bg-panel-strong"
                  >
                    {expanded ? "Hide episodes" : "Show episodes"}
                  </button>
                </header>

                {expanded ? (
                  <ul className="grid gap-2 border-t border-line/60 px-4 py-3 sm:grid-cols-2">
                    {group.episodes.map((episode) => {
                      const isSelected = selectedIds.has(episode.id);
                      const airDate = formatAirDate(episode.airDate);

                      return (
                        <li key={episode.id}>
                          <label
                            className={`flex h-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm leading-6 transition ${
                              isSelected
                                ? "border-accent/40 bg-accent/10 text-foreground"
                                : "border-line/70 bg-panel text-muted hover:bg-panel-strong/60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleEpisode(episode.id)}
                              className="mt-1 h-4 w-4 rounded border-line accent-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-foreground">
                                {episode.episodeNumber}. {episode.title}
                              </span>
                              <span className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted">
                                {airDate ? <span>{airDate}</span> : null}
                                {episode.hasFile ? (
                                  <span className="rounded-full border border-line/70 px-2 py-0.5">
                                    On disk
                                  </span>
                                ) : null}
                                {episode.monitored ? (
                                  <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent">
                                    Monitored
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      {state.status === "error" && state.message ? (
        <p className="mx-6 mt-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 border-t border-line/60 p-6">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
