import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { LinkLibraryTitleTmdbOnMount } from "@/app/(workspace)/library/link-library-title-tmdb-on-mount";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import { RequestMoreContentForm } from "@/app/(workspace)/library/request-more-content-form";
import { TvEpisodeTable } from "@/app/(workspace)/library/tv-episode-table";
import { LibraryTitleDialogTabs } from "@/app/(workspace)/library/library-title-dialog-tabs";
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

/** Section heading inside a dialog tab (11px uppercase amber). */
function SectionLabel({ children }: { children: string }) {
    return (
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {children}
        </p>
    );
}

/**
 * Tab statistic. Long values drop to the body face so they wrap gracefully
 * instead of overflowing narrow stat cells.
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

function StatsGrid({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-cream/[0.07] py-4 sm:grid-cols-4">
            {children}
        </div>
    );
}

export function LibraryTitleDialog(props: LibraryTitleDialogProps) {
    const dialogTitleId = `library-title-dialog-${props.title.id}`;
    const { title, qualityProfiles, targetPathOptions, currentLibraryPathId } = props;
    const isTv = props.mediaType === "tv";

    const stats =
        props.mediaType === "tv"
            ? [
                  { label: "Seasons", value: String(props.title.totals.seasons) },
                  { label: "Episodes", value: String(props.title.totals.episodes) },
                  { label: "Available", value: String(props.title.totals.availableEpisodes) },
                  {
                      label: "Without files",
                      value: String(
                          Math.max(
                              0,
                              props.title.totals.episodes - props.title.totals.availableEpisodes,
                          ),
                      ),
                  },
              ]
            : [
                  { label: "Files", value: fileCountLabel(props.title.fileCount) },
                  { label: "Quality", value: qualityLabel(props.title.qualityLabels) },
                  { label: "Library", value: props.title.libraryName ?? "Unassigned" },
                  {
                      label: "Updated",
                      value: props.title.lastFileModifiedAt?.toLocaleDateString() ?? "—",
                  },
              ];

    return (
        <LibraryTitleDialogTabs
            labelledBy={dialogTitleId}
            closeHref={props.closeHref}
            eyebrow={isTv ? "TV series" : "Movie"}
            title={title.title}
            sub={[title.year, title.libraryName ?? "Unassigned"].filter(Boolean).join(" · ")}
            contentLabel={isTv ? "Episodes" : "Files"}
            always={
                isTv ? (
                    <LinkLibraryTitleTmdbOnMount
                        titleId={props.title.id}
                        hasTmdbId={props.title.tmdbId !== null}
                    />
                ) : null
            }
            details={
                <div className="space-y-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                        <RecommendationPoster
                            title={title.title}
                            posterUrl={title.posterUrl}
                            className="w-[84px] rounded-[9px] sm:w-[104px] sm:rounded-[10px]"
                        />
                        <div className="min-w-0 flex-1 space-y-4">
                            {title.overview ? (
                                <p className="text-[13.5px] leading-[22px] text-pretty text-muted">
                                    {title.overview}
                                </p>
                            ) : null}
                            <StatsGrid>
                                {stats.map((stat) => (
                                    <RailStat
                                        key={stat.label}
                                        label={stat.label}
                                        value={stat.value}
                                    />
                                ))}
                            </StatsGrid>
                        </div>
                    </div>

                    <section className="space-y-2.5">
                        <SectionLabel>{isTv ? "Episode search" : "Release search"}</SectionLabel>
                        <LibraryItemSearchForm
                            titleId={title.id}
                            label={isTv ? "Search monitored episodes" : "Search for release"}
                            targetPathOptions={targetPathOptions}
                            currentLibraryPathId={currentLibraryPathId}
                        />
                    </section>
                </div>
            }
            content={
                isTv ? (
                    <div className="space-y-4">
                        <RequestMoreContentForm
                            titleId={props.title.id}
                            tmdbId={props.title.tmdbId}
                            titleLabel={props.title.title}
                            monitoredSeasons={props.title.seasons
                                .filter((s) => s.monitored)
                                .map((s) => s.seasonNumber)}
                            monitoredEpisodes={props.title.monitoredEpisodes}
                        />
                        <TvEpisodeTable
                            titleId={props.title.id}
                            seasons={props.title.seasons}
                            targetPathOptions={targetPathOptions}
                            currentLibraryPathId={currentLibraryPathId}
                        />
                    </div>
                ) : props.title.fileCount > 0 ? (
                    <div className="rounded-[14px] border border-cream/[0.08] bg-cream/[0.03] px-[18px] py-4">
                        <StatsGrid>
                            <RailStat label="Files" value={fileCountLabel(props.title.fileCount)} />
                            <RailStat
                                label="Quality"
                                value={qualityLabel(props.title.qualityLabels)}
                            />
                            <RailStat
                                label="Added"
                                value={props.title.lastFileModifiedAt?.toLocaleDateString() ?? "—"}
                            />
                        </StatsGrid>
                    </div>
                ) : (
                    <div className="rounded-[14px] border border-dashed border-cream/[0.14] bg-cream/[0.02] p-7 text-center">
                        <p className="mb-1 font-heading text-[19px] text-foreground">
                            No file on disk yet
                        </p>
                        <p className="text-[13px] leading-5 text-muted">
                            {props.title.monitored
                                ? "This title is monitored — Nooklet will grab it when a release matches your profile."
                                : "This title is unmonitored. Turn monitoring on in Settings, or search for a release from Details."}
                        </p>
                    </div>
                )
            }
            settings={
                <div className="space-y-6">
                    {/* Stays single-column: `md:` is a viewport breakpoint and would
              otherwise split this form awkwardly inside the tab body. */}
                    <section className="space-y-2.5">
                        <SectionLabel>Preferences</SectionLabel>
                        <MediaTitlePreferencesForm
                            titleId={title.id}
                            monitored={title.monitored}
                            qualityProfile={title.qualityProfile}
                            qualityProfiles={qualityProfiles}
                            className="md:grid-cols-1 md:items-stretch"
                        />
                    </section>
                    <section className="space-y-2.5">
                        <SectionLabel>Danger zone</SectionLabel>
                        <div className="rounded-xl border border-accent-wine/[0.28] bg-accent-wine/[0.07] px-4 py-4">
                            <RemoveMediaTitleForm titleId={title.id} title={title.title} />
                        </div>
                    </section>
                </div>
            }
        />
    );
}
