"use client";

import { useActionState, useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  initialSonarrLibraryActionState,
} from "@/app/(workspace)/sonarr-library-action-state";
import { submitSonarrSeriesSeasonMonitoringAction } from "@/app/(workspace)/sonarr-library-actions";
import { Button } from "@/components/ui/button";
import { type SonarrLibrarySeasonSummary } from "@/modules/service-connections/adapters/library-collections";

type SonarrSeasonMonitorModalProps = {
  open: boolean;
  onClose: () => void;
  seriesId: number;
  seriesTitle: string;
  seasons: SonarrLibrarySeasonSummary[];
  returnTo: string;
};

function formatSeasonLabel(seasonNumber: number) {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
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
  const [state, formAction] = useActionState(
    submitSonarrSeriesSeasonMonitoringAction,
    initialSonarrLibraryActionState,
  );
  const [isPending, startTransition] = useTransition();

  const initiallyMonitored = useMemo(
    () =>
      new Set(
        seasons
          .filter((season) => season.monitored)
          .map((season) => season.seasonNumber),
      ),
    [seasons],
  );

  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(initiallyMonitored);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSelectedSeasons(initiallyMonitored);
  }, [initiallyMonitored, open]);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onClose();
    }
    // We intentionally only react to `state` to drive the close-on-success effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) {
    return null;
  }

  if (!mounted || typeof document === "undefined") {
    return null;
  }

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
      <form
        action={handleSubmit}
        className="relative w-full max-w-xl rounded-[28px] border border-line/80 bg-panel p-6 shadow-soft"
      >
        <input type="hidden" name="seriesId" value={seriesId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="flex items-start justify-between gap-4">
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
              Toggle whole seasons on or off. Specials (Season 0) are listed last.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line/70 bg-panel-strong px-3 py-1 text-xs font-semibold text-muted hover:bg-panel"
          >
            Close
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted">
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

        <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
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
          <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {state.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save monitoring"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
