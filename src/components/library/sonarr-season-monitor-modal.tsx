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
import { submitSonarrSeriesSeasonMonitoringAction } from "@/app/(workspace)/sonarr-library-actions";
import { Button } from "@/components/ui/button";
import { type SonarrLibrarySeasonSummary } from "@/modules/service-connections/adapters/library-collections";

import {
  formatSeasonLabel,
  SonarrEpisodePickerForm,
  useSonarrEpisodeLoader,
} from "./sonarr-episode-picker";

type SonarrSeasonMonitorModalProps = {
  open: boolean;
  onClose: () => void;
  seriesId: number;
  seriesTitle: string;
  seasons: SonarrLibrarySeasonSummary[];
  returnTo: string;
  initialMode?: Mode;
};

type Mode = "season" | "episode";

export function SonarrSeasonMonitorModal({
  open,
  onClose,
  seriesId,
  seriesTitle,
  seasons,
  returnTo,
  initialMode = "season",
}: SonarrSeasonMonitorModalProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [mounted, setMounted] = useState(false);
  const { loadState, loadEpisodesIfNeeded, reset } = useSonarrEpisodeLoader(seriesId);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state whenever the modal opens for a fresh series.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      reset();
      if (initialMode === "episode") {
        loadEpisodesIfNeeded();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seriesId, initialMode]);

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
          <SonarrEpisodePickerForm
            seriesId={seriesId}
            returnTo={returnTo}
            loadState={loadState}
            onRetry={() => {
              reset();
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
