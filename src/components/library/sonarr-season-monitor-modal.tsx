"use client";

import {
  useActionState,
  useEffect,
  useId,
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
  submitSonarrSeriesMonitoringAction,
  submitSonarrSeriesSeasonMonitoringAction,
} from "@/app/(workspace)/sonarr-library-actions";
import { LibraryItemActions } from "@/components/library/library-item-actions";
import { Button } from "@/components/ui/button";
import { type SonarrLibrarySeasonSummary } from "@/modules/service-connections/types/library-manager";

type QualityProfileOption = {
  id: number;
  name: string;
};

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
  seriesMonitored?: boolean;
  qualityProfiles?: ReadonlyArray<QualityProfileOption>;
  qualityProfileId?: number | null;
  qualityProfileName?: string | null;
  initialMode?: Mode;
  hideSeasonTab?: boolean;
  submitActionOverride?: (
    state: SonarrLibraryActionState,
    formData: FormData,
  ) => Promise<SonarrLibraryActionState>;
  extraHiddenFields?: ReadonlyArray<{ name: string; value: string }>;
};

type Mode = "season" | "episode";

function buildSeasonStateKey(seasons: SonarrLibrarySeasonSummary[]) {
  return seasons.map((season) => `${season.seasonNumber}:${season.monitored}`).join("|");
}

function buildInitialSeasonSelection(seasons: SonarrLibrarySeasonSummary[]) {
  return new Set(seasons.filter((season) => season.monitored).map((season) => season.seasonNumber));
}

export function SonarrSeasonMonitorModal({
  open,
  onClose,
  seriesId,
  seriesTitle,
  seasons,
  returnTo,
  seriesMonitored,
  qualityProfiles = [],
  qualityProfileId,
  qualityProfileName,
  initialMode = "season",
  hideSeasonTab = false,
  submitActionOverride,
  extraHiddenFields,
}: SonarrSeasonMonitorModalProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const [mode, setMode] = useState<Mode>(() => (hideSeasonTab ? "episode" : initialMode));
  const { loadState, loadEpisodesIfNeeded, reset } = useSonarrEpisodeLoader(seriesId);
  const shouldAutoLoadEpisodes = initialMode === "episode" || hideSeasonTab;

  useEffect(() => {
    if (open && shouldAutoLoadEpisodes) {
      loadEpisodesIfNeeded();
    }
  }, [loadEpisodesIfNeeded, open, shouldAutoLoadEpisodes]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [onClose, open]);

  function selectEpisodeMode() {
    setMode("episode");
    loadEpisodesIfNeeded();
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur"
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

        {!hideSeasonTab ? (
          <SonarrSeriesControls
            seriesId={seriesId}
            seriesTitle={seriesTitle}
            seriesMonitored={seriesMonitored ?? false}
            qualityProfiles={qualityProfiles}
            qualityProfileId={qualityProfileId}
            qualityProfileName={qualityProfileName}
            returnTo={returnTo}
            onAfterAction={() => router.refresh()}
          />
        ) : null}

        <div
          role="tablist"
          aria-label="Monitoring scope"
          className={`flex gap-2 border-b border-line/60 px-6 py-3 ${hideSeasonTab ? "hidden" : ""}`}
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

        {mode === "season" && !hideSeasonTab ? (
          <SeasonModeForm
            key={buildSeasonStateKey(seasons)}
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
            submitAction={submitActionOverride}
            extraHiddenFields={extraHiddenFields}
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
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(() =>
    buildInitialSeasonSelection(seasons),
  );

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
          {isPending ? "Saving..." : "Save monitoring"}
        </Button>
      </div>
    </form>
  );
}

function SonarrSeriesControls({
  seriesId,
  seriesTitle,
  seriesMonitored,
  qualityProfiles,
  qualityProfileId,
  qualityProfileName,
  returnTo,
  onAfterAction,
}: {
  seriesId: number;
  seriesTitle: string;
  seriesMonitored: boolean;
  qualityProfiles: ReadonlyArray<QualityProfileOption>;
  qualityProfileId?: number | null;
  qualityProfileName?: string | null;
  returnTo: string;
  onAfterAction: () => void;
}) {
  const [isApplying, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function applyAllSeasons(monitored: boolean) {
    setErrorMessage(null);
    const formData = new FormData();
    formData.set("seriesId", String(seriesId));
    formData.set("monitored", monitored ? "true" : "false");
    formData.set("applyToAllSeasons", "true");
    formData.set("returnTo", returnTo);

    startTransition(async () => {
      const result = await submitSonarrSeriesMonitoringAction(
        initialSonarrLibraryActionState,
        formData,
      );
      if (result.status === "error") {
        setErrorMessage(result.message ?? "Failed to update Sonarr monitoring.");
        return;
      }
      onAfterAction();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line/60 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Series
          </span>
          <span className="text-foreground">
            Currently {seriesMonitored ? "monitored" : "unmonitored"}
          </span>
        </div>
        <LibraryItemActions
          key={`sonarr-${seriesId}-${qualityProfileId ?? "none"}`}
          target={{ serviceType: "sonarr", seriesId }}
          monitored={seriesMonitored}
          itemTitle={seriesTitle}
          returnTo={returnTo}
          qualityProfiles={qualityProfiles}
          qualityProfileId={qualityProfileId}
          qualityProfileName={qualityProfileName}
          enableSearch
          size="sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">All seasons:</span>
        <Button
          type="button"
          variant="secondary"
          className="min-h-9 px-3 py-1.5 text-xs"
          onClick={() => applyAllSeasons(true)}
          disabled={isApplying}
        >
          {isApplying ? "Saving..." : "Monitor all seasons"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-9 px-3 py-1.5 text-xs"
          onClick={() => applyAllSeasons(false)}
          disabled={isApplying}
        >
          {isApplying ? "Saving..." : "Unmonitor all seasons"}
        </Button>
      </div>
      {errorMessage ? (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}