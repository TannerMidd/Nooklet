"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { RadarrMovieModal } from "@/components/library/radarr-movie-modal";
import { SonarrSeasonMonitorModal } from "@/components/library/sonarr-season-monitor-modal";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import {
  type RadarrLibraryMovie,
  type SonarrLibrarySeries,
} from "@/modules/service-connections/types/library-manager";

type SonarrLibraryBrowserGridProps = {
  serviceType: "sonarr";
  items: SonarrLibrarySeries[];
  returnTo: string;
  autoOpenSeriesId?: number | null;
  autoOpenMode?: "season" | "episode";
};

type RadarrLibraryBrowserGridProps = {
  serviceType: "radarr";
  items: RadarrLibraryMovie[];
  returnTo: string;
};

type LibraryBrowserGridProps =
  | SonarrLibraryBrowserGridProps
  | RadarrLibraryBrowserGridProps;

function normalizeFilterToken(value: string) {
  return value.trim().toLowerCase();
}

function matchesFilter(
  item: { title: string; sortTitle: string; year: number | null },
  needle: string,
) {
  if (!needle) {
    return true;
  }

  const haystack = `${item.title} ${item.sortTitle} ${item.year ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

export function LibraryBrowserGrid(props: LibraryBrowserGridProps) {
  const { serviceType, items, returnTo } = props;
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const needle = normalizeFilterToken(deferredFilter);

  const [selectedSonarrSeriesId, setSelectedSonarrSeriesId] = useState<number | null>(null);
  const [modalInitialMode, setModalInitialMode] = useState<"season" | "episode">("season");
  const [selectedRadarrMovieId, setSelectedRadarrMovieId] = useState<number | null>(null);

  // When the page is opened with ?seriesId=...&mode=episode (e.g. after a direct-search add),
  // auto-open the modal in episode mode for that series.
  const autoOpenSeriesId =
    serviceType === "sonarr" ? props.autoOpenSeriesId ?? null : null;
  const autoOpenMode = serviceType === "sonarr" ? props.autoOpenMode ?? "season" : "season";
  const lastAutoOpenedRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      serviceType !== "sonarr" ||
      autoOpenSeriesId === null ||
      lastAutoOpenedRef.current === autoOpenSeriesId
    ) {
      return;
    }

    const exists = (items as SonarrLibrarySeries[]).some(
      (entry) => entry.id === autoOpenSeriesId,
    );

    if (!exists) {
      return;
    }

    lastAutoOpenedRef.current = autoOpenSeriesId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-open driven by deep-link prop; ref guards re-entry.
    setModalInitialMode(autoOpenMode);
    setSelectedSonarrSeriesId(autoOpenSeriesId);
  }, [serviceType, autoOpenSeriesId, autoOpenMode, items]);

  const filteredItems = useMemo(() => {
    if (serviceType === "sonarr") {
      return (items as SonarrLibrarySeries[]).filter((item) => matchesFilter(item, needle));
    }

    return (items as RadarrLibraryMovie[]).filter((item) => matchesFilter(item, needle));
  }, [items, needle, serviceType]);

  const totalCount = items.length;
  const filteredCount = filteredItems.length;
  const placeholder =
    serviceType === "sonarr"
      ? "Filter your series by title or year"
      : "Filter your movies by title or year";
  const emptyLabel =
    serviceType === "sonarr"
      ? "No series match that filter."
      : "No movies match that filter.";
  const emptyLibraryLabel =
    serviceType === "sonarr"
      ? "Sonarr has not returned any series for this account yet."
      : "Radarr has not returned any movies for this account yet.";

  const selectedSeries =
    serviceType === "sonarr" && selectedSonarrSeriesId !== null
      ? (items as SonarrLibrarySeries[]).find((entry) => entry.id === selectedSonarrSeriesId) ??
        null
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex w-full max-w-md flex-col gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Filter
          </span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/40 focus:bg-panel"
          />
        </label>
        <p className="text-xs text-muted">
          {needle.length > 0
            ? `${filteredCount} of ${totalCount} shown`
            : `${totalCount} total`}
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-[24px] border border-line/70 bg-panel-strong/40 px-6 py-10 text-center text-sm text-muted">
          {emptyLibraryLabel}
        </div>
      ) : filteredCount === 0 ? (
        <div className="rounded-[24px] border border-line/70 bg-panel-strong/40 px-6 py-10 text-center text-sm text-muted">
          {emptyLabel}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
          {serviceType === "sonarr"
            ? (filteredItems as SonarrLibrarySeries[]).map((series) => (
                <SonarrLibraryCard
                  key={series.id}
                  series={series}
                  returnTo={returnTo}
                  onClick={() => {
                    setModalInitialMode("season");
                    setSelectedSonarrSeriesId(series.id);
                  }}
                />
              ))
            : (filteredItems as RadarrLibraryMovie[]).map((movie) => (
                <RadarrLibraryCard
                  key={movie.id}
                  movie={movie}
                  returnTo={returnTo}
                  onClick={() => setSelectedRadarrMovieId(movie.id)}
                />
              ))}
        </ul>
      )}

      {serviceType === "sonarr" && selectedSeries ? (
        <SonarrSeasonMonitorModal
          open
          onClose={() => setSelectedSonarrSeriesId(null)}
          seriesId={selectedSeries.id}
          seriesTitle={
            selectedSeries.year
              ? `${selectedSeries.title} (${selectedSeries.year})`
              : selectedSeries.title
          }
          seasons={selectedSeries.seasons}
          seriesMonitored={selectedSeries.monitored}
          returnTo={returnTo}
          initialMode={modalInitialMode}
        />
      ) : null}
      {serviceType === "radarr" && selectedRadarrMovieId !== null ? (
        (() => {
          const movie = (items as RadarrLibraryMovie[]).find(
            (entry) => entry.id === selectedRadarrMovieId,
          );
          if (!movie) {
            return null;
          }
          return (
            <RadarrMovieModal
              open
              movie={movie}
              returnTo={returnTo}
              onClose={() => setSelectedRadarrMovieId(null)}
            />
          );
        })()
      ) : null}
    </div>
  );
}

function MonitoredBadge({ monitored }: { monitored: boolean }) {
  return (
    <span
      className={
        monitored
          ? "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-200"
          : "inline-flex items-center rounded-full border border-line/70 bg-panel-strong/70 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted"
      }
    >
      {monitored ? "Monitored" : "Unmonitored"}
    </span>
  );
}

function SonarrLibraryCard({
  series,
  returnTo,
  onClick,
}: {
  series: SonarrLibrarySeries;
  returnTo: string;
  onClick: () => void;
}) {
  const titleLabel = series.year ? `${series.title} (${series.year})` : series.title;
  const fileCoverage =
    series.episodeCount > 0
      ? `${series.episodeFileCount}/${series.episodeCount} episodes`
      : null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className="group flex h-full w-full flex-col gap-3 rounded-[24px] border border-line/80 bg-panel/90 p-3 text-left shadow-soft backdrop-blur transition hover:border-accent/40 hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-start gap-3">
          <RecommendationPoster title={series.title} posterUrl={series.posterUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="space-y-1">
              <h3 className="font-heading text-base leading-tight text-foreground line-clamp-2">
                {titleLabel}
              </h3>
              {series.network ? (
                <p className="text-xs text-muted line-clamp-1">{series.network}</p>
              ) : null}
            </div>
            <MonitoredBadge monitored={series.monitored} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
          <div>
            <dt className="text-[0.6rem] uppercase tracking-[0.18em]">Seasons</dt>
            <dd className="text-foreground">
              {series.monitoredSeasonCount}/{series.totalSeasonCount}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6rem] uppercase tracking-[0.18em]">Files</dt>
            <dd className="text-foreground">{fileCoverage ?? "—"}</dd>
          </div>
        </dl>
        <LibraryItemActions
          target={{ serviceType: "sonarr", seriesId: series.id }}
          monitored={series.monitored}
          itemTitle={titleLabel}
          returnTo={returnTo}
          size="sm"
        />
        <span className="mt-auto text-xs font-semibold text-accent opacity-80 group-hover:opacity-100">
          Manage seasons →
        </span>
      </div>
    </li>
  );
}

function RadarrLibraryCard({
  movie,
  returnTo,
  onClick,
}: {
  movie: RadarrLibraryMovie;
  returnTo: string;
  onClick: () => void;
}) {
  const titleLabel = movie.year ? `${movie.title} (${movie.year})` : movie.title;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className="group flex h-full w-full flex-col gap-3 rounded-[24px] border border-line/80 bg-panel/90 p-3 text-left shadow-soft backdrop-blur transition hover:border-accent/40 hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-start gap-3">
          <RecommendationPoster title={movie.title} posterUrl={movie.posterUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="space-y-1">
              <h3 className="font-heading text-base leading-tight text-foreground line-clamp-2">
                {titleLabel}
              </h3>
              {movie.studio ? (
                <p className="text-xs text-muted line-clamp-1">{movie.studio}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <MonitoredBadge monitored={movie.monitored} />
              <span
                className={
                  movie.hasFile
                    ? "inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-emerald-200"
                    : "inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-200"
                }
              >
                {movie.hasFile ? "On disk" : "Missing"}
              </span>
            </div>
          </div>
        </div>
        {movie.status ? (
          <p className="text-xs text-muted">
            <span className="text-[0.6rem] uppercase tracking-[0.18em]">Status</span>{" "}
            <span className="text-foreground">{movie.status}</span>
          </p>
        ) : null}
        <LibraryItemActions
          target={{ serviceType: "radarr", movieId: movie.id }}
          monitored={movie.monitored}
          itemTitle={titleLabel}
          returnTo={returnTo}
          size="sm"
        />
      </div>
    </li>
  );
}
