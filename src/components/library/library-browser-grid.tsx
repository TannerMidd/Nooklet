"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LayoutGrid,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { LibraryItemActions } from "@/components/library/library-item-actions";
import { MonitoringStatusIcon } from "@/components/library/monitoring-status-icon";
import { RadarrMovieModal } from "@/components/library/radarr-movie-modal";
import { SonarrSeasonMonitorModal } from "@/components/library/sonarr-season-monitor-modal";
import { formatDriveSpaceBytes } from "@/components/recommendations/recommendation-drive-space";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { cn } from "@/lib/utils";
import {
  type RadarrLibraryMovie,
  type SonarrLibrarySeries,
} from "@/modules/service-connections/types/library-manager";

type QualityProfileOption = {
  id: number;
  name: string;
};

type SonarrLibraryBrowserGridProps = {
  serviceType: "sonarr";
  items: SonarrLibrarySeries[];
  returnTo: string;
  qualityProfiles: ReadonlyArray<QualityProfileOption>;
  autoOpenSeriesId?: number | null;
  autoOpenMode?: "season" | "episode";
};

type RadarrLibraryBrowserGridProps = {
  serviceType: "radarr";
  items: RadarrLibraryMovie[];
  returnTo: string;
  qualityProfiles: ReadonlyArray<QualityProfileOption>;
};

type LibraryBrowserGridProps =
  | SonarrLibraryBrowserGridProps
  | RadarrLibraryBrowserGridProps;

type LibraryViewMode = "grid" | "table";
type LibrarySortKey = "title" | "year" | "size";
type LibrarySortDirection = "asc" | "desc";
type LibraryServiceType = "sonarr" | "radarr";

type LibrarySortState = {
  key: LibrarySortKey;
  direction: LibrarySortDirection;
};

type LibraryTableItem = SonarrLibrarySeries | RadarrLibraryMovie;

const libraryViewOptions: Array<{
  mode: LibraryViewMode;
  label: string;
  Icon: LucideIcon;
}> = [
  { mode: "grid", label: "Grid view", Icon: LayoutGrid },
  { mode: "table", label: "Table view", Icon: Table2 },
];

const sortableLibraryColumns: Array<{
  key: LibrarySortKey;
  label: string;
  align?: "left" | "right";
}> = [
  { key: "title", label: "Title" },
  { key: "year", label: "Year" },
  { key: "size", label: "Size on disk", align: "right" },
];

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

function getTitleLabel(item: { title: string; year: number | null }) {
  return item.year ? `${item.title} (${item.year})` : item.title;
}

function getDefaultSortDirection(key: LibrarySortKey): LibrarySortDirection {
  return key === "title" ? "asc" : "desc";
}

function compareText(left: string, right: string, direction: LibrarySortDirection) {
  const result = left.localeCompare(right, undefined, { sensitivity: "base" });

  return direction === "asc" ? result : -result;
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: LibrarySortDirection,
) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareTableItems(
  left: LibraryTableItem,
  right: LibraryTableItem,
  sort: LibrarySortState,
) {
  const primary = (() => {
    if (sort.key === "title") {
      return compareText(left.sortTitle, right.sortTitle, sort.direction);
    }

    if (sort.key === "year") {
      return compareNullableNumber(left.year, right.year, sort.direction);
    }

    return compareNullableNumber(left.sizeOnDiskBytes, right.sizeOnDiskBytes, sort.direction);
  })();

  return primary || compareText(left.sortTitle, right.sortTitle, "asc");
}

function sortTableItems<T extends LibraryTableItem>(items: T[], sort: LibrarySortState) {
  return [...items].sort((left, right) => compareTableItems(left, right, sort));
}

function formatDiskSize(bytes: number | null) {
  return formatDriveSpaceBytes(bytes) ?? "Unknown";
}

function getLibraryItemNoun(serviceType: LibraryServiceType, count: number) {
  if (serviceType === "sonarr") {
    return "series";
  }

  return count === 1 ? "movie" : "movies";
}

export function LibraryBrowserGrid(props: LibraryBrowserGridProps) {
  const { serviceType, items, returnTo, qualityProfiles } = props;
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const needle = normalizeFilterToken(deferredFilter);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("grid");
  const [tableSort, setTableSort] = useState<LibrarySortState>({
    key: "size",
    direction: "desc",
  });
  const [selectedTableItemIds, setSelectedTableItemIds] = useState<number[]>([]);

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

  const sortedTableItems = useMemo(() => {
    if (serviceType === "sonarr") {
      return sortTableItems(filteredItems as SonarrLibrarySeries[], tableSort);
    }

    return sortTableItems(filteredItems as RadarrLibraryMovie[], tableSort);
  }, [filteredItems, serviceType, tableSort]);

  const selectedTableItemIdSet = useMemo(
    () => new Set(selectedTableItemIds),
    [selectedTableItemIds],
  );

  function handleTableSort(nextKey: LibrarySortKey) {
    setTableSort((current) => {
      if (current.key !== nextKey) {
        return { key: nextKey, direction: getDefaultSortDirection(nextKey) };
      }

      return {
        key: nextKey,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function handleToggleTableItemSelection(itemId: number) {
    setSelectedTableItemIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((selectedItemId) => selectedItemId !== itemId)
        : [...currentIds, itemId],
    );
  }

  function handleToggleVisibleTableSelection() {
    const visibleItemIds = sortedTableItems.map((item) => item.id);
    const visibleItemIdSet = new Set(visibleItemIds);

    setSelectedTableItemIds((currentIds) => {
      const currentIdSet = new Set(currentIds);
      const allVisibleSelected = visibleItemIds.every((itemId) => currentIdSet.has(itemId));

      if (allVisibleSelected) {
        return currentIds.filter((itemId) => !visibleItemIdSet.has(itemId));
      }

      return [
        ...currentIds,
        ...visibleItemIds.filter((itemId) => !currentIdSet.has(itemId)),
      ];
    });
  }

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
          <span className="font-heading text-sm italic text-muted">
            Filter
          </span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/75 focus:border-accent/55 focus:ring-1 focus:ring-accent/25"
          />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted">
            {needle.length > 0
              ? `${filteredCount} of ${totalCount} shown`
              : `${totalCount} total`}
          </p>
          <div
            role="group"
            aria-label="Library display"
            className="inline-grid grid-flow-col gap-1 rounded-lg border border-line/65 bg-background/20 p-1"
          >
            {libraryViewOptions.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
                  viewMode === mode
                    ? "nooklet-tab--active text-accent-foreground"
                    : "text-muted hover:bg-panel-strong/45 hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-lg border border-line/60 bg-background/15 px-6 py-10 text-center text-sm text-muted">
          {emptyLibraryLabel}
        </div>
      ) : filteredCount === 0 ? (
        <div className="rounded-lg border border-line/60 bg-background/15 px-6 py-10 text-center text-sm text-muted">
          {emptyLabel}
        </div>
      ) : viewMode === "table" ? (
        serviceType === "sonarr" ? (
          <LibraryBrowserTable
            serviceType="sonarr"
            items={sortedTableItems as SonarrLibrarySeries[]}
            returnTo={returnTo}
            sort={tableSort}
            selectedItemIds={selectedTableItemIdSet}
            onSortChange={handleTableSort}
            onToggleItemSelection={handleToggleTableItemSelection}
            onToggleVisibleSelection={handleToggleVisibleTableSelection}
            onOpenItem={(seriesId) => {
              setModalInitialMode("season");
              setSelectedSonarrSeriesId(seriesId);
            }}
          />
        ) : (
          <LibraryBrowserTable
            serviceType="radarr"
            items={sortedTableItems as RadarrLibraryMovie[]}
            returnTo={returnTo}
            sort={tableSort}
            selectedItemIds={selectedTableItemIdSet}
            onSortChange={handleTableSort}
            onToggleItemSelection={handleToggleTableItemSelection}
            onToggleVisibleSelection={handleToggleVisibleTableSelection}
            onOpenItem={setSelectedRadarrMovieId}
          />
        )
      ) : (
        <ul className="grid max-h-[72vh] grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4 overflow-y-auto pr-2">
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
          qualityProfiles={qualityProfiles}
          qualityProfileId={selectedSeries.qualityProfileId}
          qualityProfileName={selectedSeries.qualityProfileName}
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
              qualityProfiles={qualityProfiles}
              returnTo={returnTo}
              onClose={() => setSelectedRadarrMovieId(null)}
            />
          );
        })()
      ) : null}
    </div>
  );
}

type LibraryBrowserTableProps =
  | {
      serviceType: "sonarr";
      items: SonarrLibrarySeries[];
      returnTo: string;
      sort: LibrarySortState;
      selectedItemIds: ReadonlySet<number>;
      onSortChange: (key: LibrarySortKey) => void;
      onToggleItemSelection: (itemId: number) => void;
      onToggleVisibleSelection: () => void;
      onOpenItem: (seriesId: number) => void;
    }
  | {
      serviceType: "radarr";
      items: RadarrLibraryMovie[];
      returnTo: string;
      sort: LibrarySortState;
      selectedItemIds: ReadonlySet<number>;
      onSortChange: (key: LibrarySortKey) => void;
      onToggleItemSelection: (itemId: number) => void;
      onToggleVisibleSelection: () => void;
      onOpenItem: (movieId: number) => void;
    };

function getAriaSort(
  sort: LibrarySortState,
  key: LibrarySortKey,
): "ascending" | "descending" | "none" {
  if (sort.key !== key) {
    return "none";
  }

  return sort.direction === "asc" ? "ascending" : "descending";
}

function SortableColumnHeader({
  label,
  sortKey,
  sort,
  align = "left",
  onSortChange,
}: {
  label: string;
  sortKey: LibrarySortKey;
  sort: LibrarySortState;
  align?: "left" | "right";
  onSortChange: (key: LibrarySortKey) => void;
}) {
  const active = sort.key === sortKey;
  const SortIcon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSortChange(sortKey)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted transition hover:bg-panel-strong/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        active && "text-foreground",
        align === "right" && "ml-auto",
      )}
    >
      <span>{label}</span>
      <SortIcon aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}

function LibraryBrowserTable(props: LibraryBrowserTableProps) {
  const detailHeaders =
    props.serviceType === "sonarr"
      ? ["Episodes", "Seasons", "Monitoring"]
      : ["File", "Monitoring", "Status"];
  const visibleItemIds = props.items.map((item) => item.id);
  const selectedVisibleCount = visibleItemIds.filter((itemId) =>
    props.selectedItemIds.has(itemId),
  ).length;
  const allVisibleSelected =
    visibleItemIds.length > 0 && selectedVisibleCount === visibleItemIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const itemLabel = getLibraryItemNoun(props.serviceType, props.items.length);

  return (
    <div className="max-h-[72vh] overflow-auto rounded-lg border border-line/65 bg-background/10">
      <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-line/65 bg-panel-strong/95 backdrop-blur">
          <tr>
            <th scope="col" className="w-12 px-4 py-3">
              <LibrarySelectAllCheckbox
                label={`Select all visible ${itemLabel}`}
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={props.onToggleVisibleSelection}
              />
            </th>
            {sortableLibraryColumns.map(({ key, label, align }) => (
              <th
                key={key}
                scope="col"
                aria-sort={getAriaSort(props.sort, key)}
                className={cn("px-4 py-3", align === "right" && "text-right")}
              >
                <SortableColumnHeader
                  label={label}
                  sortKey={key}
                  sort={props.sort}
                  align={align}
                  onSortChange={props.onSortChange}
                />
              </th>
            ))}
            {detailHeaders.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 text-xs font-semibold text-muted">
                {header}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-muted">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {props.serviceType === "sonarr"
            ? props.items.map((series) => (
                <LibraryTableRow
                  key={series.id}
                  serviceType="sonarr"
                  item={series}
                  returnTo={props.returnTo}
                  selected={props.selectedItemIds.has(series.id)}
                  onToggleSelection={() => props.onToggleItemSelection(series.id)}
                  onOpen={() => props.onOpenItem(series.id)}
                />
              ))
            : props.items.map((movie) => (
                <LibraryTableRow
                  key={movie.id}
                  serviceType="radarr"
                  item={movie}
                  returnTo={props.returnTo}
                  selected={props.selectedItemIds.has(movie.id)}
                  onToggleSelection={() => props.onToggleItemSelection(movie.id)}
                  onOpen={() => props.onOpenItem(movie.id)}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
}

function LibrarySelectAllCheckbox({
  label,
  checked,
  indeterminate,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      aria-label={label}
      aria-checked={indeterminate ? "mixed" : checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-line bg-panel text-accent"
    />
  );
}

function LibraryTableTitleCell({
  title,
  subtitle,
  onOpen,
}: {
  title: string;
  subtitle: string | null;
  onOpen: () => void;
}) {
  return (
    <td className="px-4 py-3 align-middle">
      <button
        type="button"
        onClick={onOpen}
        className="max-w-[24rem] text-left font-heading text-sm leading-tight text-foreground transition hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      >
        <span className="block truncate">{title}</span>
      </button>
      {subtitle ? (
        <span className="mt-1 block max-w-[24rem] truncate text-xs text-muted">
          {subtitle}
        </span>
      ) : null}
    </td>
  );
}

function LibraryTableRow({
  serviceType,
  item,
  returnTo,
  selected,
  onToggleSelection,
  onOpen,
}:
  | {
      serviceType: "sonarr";
      item: SonarrLibrarySeries;
      returnTo: string;
      selected: boolean;
      onToggleSelection: () => void;
      onOpen: () => void;
    }
  | {
      serviceType: "radarr";
      item: RadarrLibraryMovie;
      returnTo: string;
      selected: boolean;
      onToggleSelection: () => void;
      onOpen: () => void;
    }) {
  const titleLabel = getTitleLabel(item);

  return (
    <tr className="transition hover:bg-panel-strong/35">
      <td className="px-4 py-3 align-middle">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${titleLabel}`}
          onChange={onToggleSelection}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 rounded border-line bg-panel text-accent"
        />
      </td>
      <LibraryTableTitleCell
        title={titleLabel}
        subtitle={serviceType === "sonarr" ? item.network : item.studio}
        onOpen={onOpen}
      />
      <td className="px-4 py-3 align-middle text-muted">{item.year ?? "Unknown"}</td>
      <td className="px-4 py-3 text-right align-middle font-medium tabular-nums text-foreground">
        {formatDiskSize(item.sizeOnDiskBytes)}
      </td>
      {serviceType === "sonarr" ? (
        <>
          <td className="px-4 py-3 align-middle text-foreground">
            {item.episodeCount > 0
              ? `${item.episodeFileCount}/${item.episodeCount}`
              : "Unknown"}
          </td>
          <td className="px-4 py-3 align-middle text-foreground">
            {item.monitoredSeasonCount}/{item.totalSeasonCount}
          </td>
        </>
      ) : (
        <td className="px-4 py-3 align-middle">
          <span
            className={
              item.hasFile
                ? "inline-flex items-center rounded-md border border-accent-cool/35 bg-accent-cool/10 px-2 py-0.5 text-[0.65rem] font-medium text-accent-cool"
                : "inline-flex items-center rounded-md border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[0.65rem] font-medium text-highlight"
            }
          >
            {item.hasFile ? "On disk" : "Missing"}
          </span>
        </td>
      )}
      <td className="px-4 py-3 align-middle">
        <MonitoringStatusIcon monitored={item.monitored} />
      </td>
      {serviceType === "radarr" ? (
        <td className="px-4 py-3 align-middle text-muted">{item.status ?? "Unknown"}</td>
      ) : null}
      <td className="px-4 py-3 align-middle">
        <LibraryItemActions
          target={
            serviceType === "sonarr"
              ? { serviceType: "sonarr", seriesId: item.id }
              : { serviceType: "radarr", movieId: item.id }
          }
          monitored={item.monitored}
          itemTitle={titleLabel}
          returnTo={returnTo}
          className="flex flex-nowrap items-center justify-end gap-2"
        />
      </td>
    </tr>
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
        className="group flex h-full w-full flex-col gap-3 rounded-lg border border-line/65 bg-panel/85 p-3 text-left transition hover:border-accent/40 hover:bg-panel-strong/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
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
            <MonitoringStatusIcon monitored={series.monitored} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
          <div>
            <dt className="text-[0.65rem] font-medium">Seasons</dt>
            <dd className="text-foreground">
              {series.monitoredSeasonCount}/{series.totalSeasonCount}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-medium">Files</dt>
            <dd className="text-foreground">{fileCoverage ?? "—"}</dd>
          </div>
        </dl>
        <LibraryItemActions
          target={{ serviceType: "sonarr", seriesId: series.id }}
          monitored={series.monitored}
          itemTitle={titleLabel}
          returnTo={returnTo}
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
        className="group flex h-full w-full flex-col gap-3 rounded-lg border border-line/65 bg-panel/85 p-3 text-left transition hover:border-accent/40 hover:bg-panel-strong/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
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
              <MonitoringStatusIcon monitored={movie.monitored} />
              <span
                className={
                  movie.hasFile
                    ? "inline-flex items-center rounded-md border border-accent-cool/35 bg-accent-cool/10 px-2 py-0.5 text-[0.65rem] font-medium text-accent-cool"
                    : "inline-flex items-center rounded-md border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[0.65rem] font-medium text-highlight"
                }
              >
                {movie.hasFile ? "On disk" : "Missing"}
              </span>
            </div>
          </div>
        </div>
        {movie.status ? (
          <p className="text-xs text-muted">
            <span className="text-[0.65rem] font-medium">Status</span>{" "}
            <span className="text-foreground">{movie.status}</span>
          </p>
        ) : null}
        <LibraryItemActions
          target={{ serviceType: "radarr", movieId: movie.id }}
          monitored={movie.monitored}
          itemTitle={titleLabel}
          returnTo={returnTo}
        />
      </div>
    </li>
  );
}
