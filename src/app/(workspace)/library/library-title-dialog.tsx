import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { LibraryTitleDialogShell } from "@/app/(workspace)/library/library-title-dialog-shell";
import { LinkLibraryTitleTmdbOnMount } from "@/app/(workspace)/library/link-library-title-tmdb-on-mount";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import { RequestMoreContentForm } from "@/app/(workspace)/library/request-more-content-form";
import { TvEpisodeTable } from "@/app/(workspace)/library/tv-episode-table";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { type MediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import { type MediaLibraryTvTitleSummary } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import { type MediaQualityProfileOption } from "@/modules/media-library/queries/list-media-quality-profiles";

type LibraryTitleDialogProps = {
  closeHref: string;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
} & (
  | { mediaType: "movie"; title: MediaLibraryMovieTitleDetails }
  | { mediaType: "tv"; title: MediaLibraryTvTitleSummary }
);

function fileCountLabel(count: number) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function qualityLabel(qualityLabels: string[]) {
  return qualityLabels.length > 0 ? qualityLabels.join(" / ") : "No quality tag";
}

/**
 * Identity-rail statistic. Long values drop to the body face so they wrap
 * gracefully instead of overflowing the 292px rail.
 */
function RailStat({ label, value }: { label: string; value: string }) {
  const long = value.length > 8;

  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted/80">
        {label}
      </p>
      <p
        className={
          long
            ? "mt-1 text-sm font-semibold leading-[18px] text-foreground"
            : "mt-0.5 font-heading text-[19px] leading-[1.1] text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function LibraryTitleDialog(props: LibraryTitleDialogProps) {
  const dialogTitleId = `library-title-dialog-${props.title.id}`;
  const { title, mediaType, qualityProfiles, targetPathOptions, currentLibraryPathId } = props;

  const stats = props.mediaType === "tv"
    ? [
        { label: "Seasons", value: String(props.title.totals.seasons) },
        { label: "Episodes", value: String(props.title.totals.episodes) },
        { label: "Available", value: String(props.title.totals.availableEpisodes) },
        {
          label: "Missing",
          value: String(Math.max(0, props.title.totals.episodes - props.title.totals.availableEpisodes)),
        },
      ]
    : [
        { label: "Files", value: String(props.title.fileCount) },
        { label: "Quality", value: qualityLabel(props.title.qualityLabels) },
        { label: "Library", value: props.title.libraryName ?? "Unassigned" },
        {
          label: "Updated",
          value: props.title.lastFileModifiedAt?.toLocaleDateString() ?? "—",
        },
      ];

  return (
    <LibraryTitleDialogShell labelledBy={dialogTitleId} closeHref={props.closeHref}>
      {/* ── Identity rail ───────────────────────────────────────────── */}
      <aside className="flex shrink-0 flex-col border-cream/[0.07] bg-cream/[0.02] max-lg:border-b lg:w-[292px] lg:border-r">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-[22px]">
          <div className="flex items-start gap-3.5">
            <RecommendationPoster
              title={title.title}
              posterUrl={title.posterUrl}
              className="w-[84px] rounded-[9px] sm:w-[84px]"
            />
            <div className="min-w-0 flex-1">
              <p className="mb-[5px] text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
                {mediaType === "tv" ? "TV series" : "Movie"}
              </p>
              <h2
                id={dialogTitleId}
                className="font-heading text-[22px] leading-[1.12] text-pretty text-foreground"
              >
                {title.title}
              </h2>
              <p className="mt-[5px] text-xs leading-[17px] text-muted">
                {[title.year, title.libraryName ?? "Unassigned"].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {title.overview ? (
            <p className="text-[13px] leading-5 text-pretty text-muted">{title.overview}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-y border-cream/[0.07] py-4">
            {stats.map((stat) => (
              <RailStat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>

          <LibraryItemSearchForm
            titleId={title.id}
            label={mediaType === "tv" ? "Search monitored episodes" : "Search for release"}
            targetPathOptions={targetPathOptions}
            currentLibraryPathId={currentLibraryPathId}
          />

          {/* Stays single-column: `md:` is a viewport breakpoint and would
              otherwise split this form across the 292px rail. */}
          <MediaTitlePreferencesForm
            titleId={title.id}
            monitored={title.monitored}
            qualityProfile={title.qualityProfile}
            qualityProfiles={qualityProfiles}
            className="md:grid-cols-1 md:items-stretch"
          />
        </div>

        <div className="shrink-0 border-t border-cream/[0.07] px-5 py-3">
          <RemoveMediaTitleForm titleId={title.id} title={title.title} />
        </div>
      </aside>

      {/* ── Work pane ───────────────────────────────────────────────── */}
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[54px] shrink-0 items-center border-b border-cream/[0.07] pl-6 pr-16">
          <p className="text-sm font-semibold text-foreground">
            {mediaType === "tv" ? "Episodes" : "Files"}
          </p>
        </header>

        {props.mediaType === "tv" ? (
          <>
            <LinkLibraryTitleTmdbOnMount titleId={props.title.id} hasTmdbId={props.title.tmdbId !== null} />
            <div className="shrink-0 border-b border-cream/[0.06] px-5 py-3">
              <RequestMoreContentForm
                titleId={props.title.id}
                tmdbId={props.title.tmdbId}
                titleLabel={props.title.title}
                monitoredSeasons={props.title.seasons.filter((s) => s.monitored).map((s) => s.seasonNumber)}
                monitoredEpisodes={props.title.monitoredEpisodes}
              />
            </div>
            <TvEpisodeTable
              titleId={props.title.id}
              seasons={props.title.seasons}
              targetPathOptions={targetPathOptions}
              currentLibraryPathId={currentLibraryPathId}
            />
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {props.title.fileCount > 0 ? (
              <div className="rounded-[14px] border border-cream/[0.08] bg-cream/[0.03] px-[18px] py-4">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3.5">
                  <RailStat label="Files" value={fileCountLabel(props.title.fileCount)} />
                  <RailStat label="Quality" value={qualityLabel(props.title.qualityLabels)} />
                  <RailStat
                    label="Added"
                    value={props.title.lastFileModifiedAt?.toLocaleDateString() ?? "—"}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-cream/[0.14] bg-cream/[0.02] p-7 text-center">
                <p className="mb-1 font-heading text-[19px] text-foreground">No file on disk yet</p>
                <p className="text-[13px] leading-5 text-muted">
                  {props.title.monitored
                    ? "This title is monitored — Nooklet will grab it when a release matches your profile."
                    : "This title is unmonitored. Turn monitoring on, or search for a release from the rail."}
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </LibraryTitleDialogShell>
  );
}
