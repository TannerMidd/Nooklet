"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { MonitoringStatusIcon } from "@/components/library/monitoring-status-icon";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { type RadarrLibraryMovie } from "@/modules/service-connections/types/library-manager";

type QualityProfileOption = {
  id: number;
  name: string;
};

type RadarrMovieModalProps = {
  open: boolean;
  movie: RadarrLibraryMovie;
  qualityProfiles: ReadonlyArray<QualityProfileOption>;
  returnTo: string;
  onClose: () => void;
};

export function RadarrMovieModal({
  open,
  movie,
  qualityProfiles,
  returnTo,
  onClose,
}: RadarrMovieModalProps) {
  const dialogTitleId = useId();

  if (!open || typeof document === "undefined") {
    return null;
  }

  const titleLabel = movie.year ? `${movie.title} (${movie.year})` : movie.title;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line/80 bg-panel">
        <header className="flex items-start justify-between gap-4 border-b border-line/60 p-6">
          <div>
            <p className="font-heading text-sm italic text-accent">
              Radarr movie
            </p>
            <h2
              id={dialogTitleId}
              className="mt-2 font-heading text-2xl leading-tight text-foreground"
            >
              {titleLabel}
            </h2>
            {movie.studio ? (
              <p className="mt-1 text-sm text-muted">{movie.studio}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-panel-strong px-3 py-1 text-xs font-semibold text-muted hover:bg-panel"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex items-start gap-4">
            <RecommendationPoster title={movie.title} posterUrl={movie.posterUrl} />
            <dl className="grid flex-1 grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted">
                  Monitoring
                </dt>
                <dd className="mt-1">
                  <MonitoringStatusIcon monitored={movie.monitored} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">
                  File
                </dt>
                <dd className="mt-1 text-foreground">{movie.hasFile ? "On disk" : "Missing"}</dd>
              </div>
              {movie.status ? (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-muted">
                    Status
                  </dt>
                  <dd className="mt-1 text-foreground">{movie.status}</dd>
                </div>
              ) : null}
              <div className="col-span-2">
                <dt className="text-xs font-medium text-muted">
                  Quality profile
                </dt>
                <dd className="mt-1 text-foreground">
                  {movie.qualityProfileName ?? movie.qualityProfileId ?? "Unknown"}
                </dd>
              </div>
            </dl>
          </div>

          <section className="space-y-3 rounded-2xl border border-line/70 bg-panel-strong/70 p-4">
            <h3 className="text-sm font-medium text-foreground">Movie actions</h3>
            <p className="text-sm leading-6 text-muted">
              Change quality, search for the movie, or remove it from Radarr.
            </p>
            <LibraryItemActions
              key={`radarr-${movie.id}-${movie.qualityProfileId ?? "none"}`}
              target={{ serviceType: "radarr", movieId: movie.id }}
              monitored={movie.monitored}
              itemTitle={titleLabel}
              returnTo={returnTo}
              qualityProfiles={qualityProfiles}
              qualityProfileId={movie.qualityProfileId}
              qualityProfileName={movie.qualityProfileName}
              enableSearch
            />
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
