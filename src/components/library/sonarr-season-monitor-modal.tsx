"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  initialSonarrLibraryActionState,
  type SonarrLibraryActionState,
} from "@/app/(workspace)/sonarr-library-action-state";
import {
  loadSonarrSeriesEpisodesForLibraryAction,
  submitSonarrSeriesEpisodeMonitoringAction,
  submitSonarrSeriesSeasonMonitoringAction,
} from "@/app/(workspace)/sonarr-library-actions";
import { Button } from "@/components/ui/button";
import { type SonarrLibrarySeasonSummary } from "@/modules/service-connections/adapters/library-collections";
import { type SonarrEpisode } from "@/modules/service-connections/adapters/sonarr-episodes";

type SonarrSeasonMonitorModalProps = {
  open: boolean;
  onClose: () => void;
  seriesId: number;
  seriesTitle: string;
  seasons: SonarrLibrarySeasonSummary[];
  returnTo: string;
};

type Mode = "season" | "episode";

type EpisodeLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: SonarrEpisode[] }
  | { status: "error"; message: string };

function formatSeasonLabel(seasonNumber: number) {
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

export function SonarrSeasonMonitorModal({
  open,
  onClose,
  seriesId,
  seriesTitle,
  seasons,
  returnTo,
}: SonarrSeasonMonitorModalProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const [mode, setMode] = useState<Mode>("season");
  const [mounted, setMounted] = useState(false);
  const [episodeLoadState, setEpisodeLoadState] = useState<EpisodeLoadState>({
    status: "idle",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state whenever the modal opens for a fresh series.
  useEffect(() => {
    if (open) {
      setMode("season");
      setEpisodeLoadState({ status: "idle" });
    }
  }, [open, seriesId]);

  function loadEpisodesIfNeeded() {
    setEpisodeLoadState((current) => {
      if (current.status === "loading" || current.status === "loaded") {
        return current;
      }

      void loadSonarrSeriesEpisodesForLibraryAction(seriesId)
        .then((result) => {
          if (result.ok) {
            setEpisodeLoadState({ status: "loaded", episodes: result.episodes });
          } else {
            setEpisodeLoadState({ status: "error", message: result.message });
          }
        })
        .catch((error: unknown) => {
          setEpisodeLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load episodes from Sonarr.",
          });
        });

      return { status: "loading" };
    });
  }

  function selectEpisodeMode() {
    setMode("episode");
    loadEpisodesIfNeeded();
  }

  if (!open || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[28px] border border-line/80 bg-panel shadow-soft">
        <header className="flex items-start justify-between gap-4 border-b border-line/60 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
              Sonarr monitoring
            </p>
            <h2
              id={dialogTitleId}
              className="mt-2 font-heading text-2xl leading-tight text-foreground"
            >
              {seriesTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Toggle whole seasons, or expand a season to monitor individual episodes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line/70 bg-panel-strong px-3 py-1 text-xs font-semibold text-muted hover:bg-panel"
          >
            Close
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Monitoring scope"
          className="flex gap-2 border-b border-line/60 px-6 py-3"
        >
          <ModeTab
            label="Whole seasons"
            active={mode === "season"}
            onSelect={() => setMode("season")}
          />
          <ModeTab
            label="Specific episodes"
            active={mode === "episode"}
            onSelect={selectEpisodeMode}
          />
        </div>

        {mode === "season" ? (
          <SeasonModeForm
            seriesId={seriesId}
            seasons={seasons}
            returnTo={returnTo}
            onCancel={onClose}
            onSuccess={() => {
              router.refresh();
              onClose();
            }}
          />
        ) : (
          <EpisodeModeForm
            seriesId={seriesId}
            returnTo={returnTo}
            loadState={episodeLoadState}
            onRetry={() => {
              setEpisodeLoadState({ status: "idle" });
              loadEpisodesIfNeeded();
            }}
            onCancel={onClose}
            onSuccess={() => {
              router.refresh();
              onClose();
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function ModeTab({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-accent text-accent-foreground"
          : "border border-line/70 bg-panel-strong text-muted hover:bg-panel"
      }`}
    >
      {label}
    </button>
  );
}

function SeasonModeForm({
  seriesId,
  seasons,
  returnTo,
  onCancel,
  onSuccess,
}: {
  seriesId: number;
  seasons: SonarrLibrarySeasonSummary[];
  returnTo: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<SonarrLibraryActionState, FormData>(
    submitSonarrSeriesSeasonMonitoringAction,
    initialSonarrLibraryActionState,
  );
  const [isPending, startTransition] = useTransition();

  const initiallyMonitored = useMemo(
    () =>
      new Set(
        seasons.filter((season) => season.monitored).map((season) => season.seasonNumber),
      ),
    [seasons],
  );

  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(initiallyMonitored);

  useEffect(() => {
    setSelectedSeasons(initiallyMonitored);
  }, [initiallyMonitored]);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggleSeason(seasonNumber: number) {
    setSelectedSeasons((previous) => {
      const next = new Set(previous);
      if (next.has(seasonNumber)) {
        next.delete(seasonNumber);
      } else {
        next.add(seasonNumber);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedSeasons(new Set(seasons.map((season) => season.seasonNumber)));
  }

  function deselectAll() {
    setSelectedSeasons(new Set());
  }

  function handleSubmit(formData: FormData) {
    formData.delete("monitoredSeasonNumbers");
    for (const seasonNumber of selectedSeasons) {
      formData.append("monitoredSeasonNumbers", String(seasonNumber));
    }
    startTransition(() => {
      formAction(formData);
    });
  }

  const monitoredCountLabel = `${selectedSeasons.size} of ${seasons.length} selected`;

  return (
    <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="seriesId" value={seriesId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="flex flex-wrap items-center gap-3 px-6 pt-4 text-xs text-muted">
        <span>{monitoredCountLabel}</span>
        <button
          type="button"
          onClick={selectAll}
          className="rounded-full border border-line/70 bg-panel-strong px-3 py-1 font-semibold hover:bg-panel"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={deselectAll}
          className="rounded-full border border-line/70 bg-panel-strong px-3 py-1 font-semibold hover:bg-panel"
        >
          Deselect all
        </button>
      </div>

      <ul className="mt-4 flex-1 space-y-2 overflow-y-auto px-6 pb-2">
        {seasons.length === 0 ? (
          <li className="rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm text-muted">
            Sonarr has no seasons listed for this series yet.
          </li>
        ) : (
          seasons.map((season) => {
            const checked = selectedSeasons.has(season.seasonNumber);
            const filledLabel =
              season.episodeCount > 0
                ? `${season.episodeFileCount}/${season.episodeCount} episodes on disk`
                : "No episodes tracked";

            return (
              <li key={season.seasonNumber}>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm transition hover:bg-panel-strong">
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-line accent-accent"
                      checked={checked}
                      onChange={() => toggleSeason(season.seasonNumber)}
                    />
                    <span className="font-semibold text-foreground">
                      {formatSeasonLabel(season.seasonNumber)}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{filledLabel}</span>
                </label>
              </li>
            );
          })
        )}
      </ul>

      {state.status === "error" && state.message ? (
        <p className="mx-6 mt-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 border-t border-line/60 p-6">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save monitoring"}
        </Button>
      </div>
    </form>
  );
}

function EpisodeModeForm({
  seriesId,
  returnTo,
  loadState,
  onRetry,
  onCancel,
  onSuccess,
}: {
  seriesId: number;
  returnTo: string;
  loadState: EpisodeLoadState;
  onRetry: () => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<SonarrLibraryActionState, FormData>(
    submitSonarrSeriesEpisodeMonitoringAction,
    initialSonarrLibraryActionState,
  );
  const [isPending, startTransition] = useTransition();

  const episodes = loadState.status === "loaded" ? loadState.episodes : [];
  const seasonGroups = useMemo(() => buildSeasonGroups(episodes), [episodes]);

  const initialSelection = useMemo(
    () => new Set(episodes.filter((episode) => episode.monitored).map((episode) => episode.id)),
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
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save episode monitoring"}
        </Button>
      </div>
    </form>
  );
}
