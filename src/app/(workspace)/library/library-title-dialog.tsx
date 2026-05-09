import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { LibraryTitleDialogShell } from "@/app/(workspace)/library/library-title-dialog-shell";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import { TvEpisodeMonitoringForm } from "@/app/(workspace)/library/tv-episode-monitoring-form";
import { TvSeasonMonitoringForm } from "@/app/(workspace)/library/tv-season-monitoring-form";
import { RequestMoreContentForm } from "@/app/(workspace)/library/request-more-content-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { type MediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import {
  type MediaLibraryTvEpisodeSummary,
  type MediaLibraryTvSeasonSummary,
  type MediaLibraryTvTitleDetails,
} from "@/modules/media-library/queries/get-media-library-tv-title-details";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  getMediaQualityProfileLabel,
  type MediaQualityProfileOption,
} from "@/modules/media-library/queries/list-media-quality-profiles";

type LibraryTitleDialogProps = {
  closeHref: string;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
} & (
  | { mediaType: "movie"; title: MediaLibraryMovieTitleDetails }
  | { mediaType: "tv"; title: MediaLibraryTvTitleDetails }
);

function titleLabel(title: { title: string; year: number | null }) {
  return `${title.title}${title.year ? ` (${title.year})` : ""}`;
}

function fileCountLabel(count: number) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function qualityLabel(qualityLabels: string[]) {
  return qualityLabels.length > 0 ? qualityLabels.join(" / ") : "No quality tag";
}

function DialogPills({
  title,
}: {
  title: {
    status: string;
    monitored: boolean;
    qualityProfile: MediaQualityProfileOption["value"];
    libraryName: string | null;
  };
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1 capitalize">{title.status}</span>
      <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
        {title.monitored ? "Monitored" : "Unmonitored"}
      </span>
      <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
        {getMediaQualityProfileLabel(title.qualityProfile)}
      </span>
      <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
        {title.libraryName ?? "Unassigned"}
      </span>
    </div>
  );
}

function DialogControls({
  title,
  searchLabel,
  qualityProfiles,
  targetPathOptions,
}: {
  title: { id: string; monitored: boolean; qualityProfile: MediaQualityProfileOption["value"] };
  searchLabel: string;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
}) {
  return (
    <section className="space-y-4 rounded-lg border border-line/60 bg-background/15 p-4">
      <div>
        <h3 className="font-heading text-lg text-foreground">Settings and search</h3>
      </div>
      <MediaTitlePreferencesForm
        titleId={title.id}
        monitored={title.monitored}
        qualityProfile={title.qualityProfile}
        qualityProfiles={qualityProfiles}
      />
      <LibraryItemSearchForm
        titleId={title.id}
        label={searchLabel}
        targetPathOptions={targetPathOptions}
      />
    </section>
  );
}

function RemoveTitleSection({ titleId }: { titleId: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-red-500/35 bg-red-500/5 p-4">
      <div>
        <h3 className="font-heading text-lg text-foreground">Library record</h3>
      </div>
      <RemoveMediaTitleForm titleId={titleId} />
    </section>
  );
}

function MovieDialog({
  title,
  qualityProfiles,
  targetPathOptions,
}: {
  title: MediaLibraryMovieTitleDetails;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
}) {
  const modifiedLabel = title.lastFileModifiedAt ? title.lastFileModifiedAt.toLocaleDateString() : "No files yet";

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 flex-1 space-y-4">
          <DialogPills title={title} />
          {title.overview ? <p className="max-w-3xl text-sm leading-6 text-muted">{title.overview}</p> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label="Files" value={fileCountLabel(title.fileCount)} />
            <Fact label="Quality" value={qualityLabel(title.qualityLabels)} />
            <Fact label="Updated" value={modifiedLabel} />
          </div>
        </div>
      </div>

      <DialogControls
        title={title}
        searchLabel="Search movie"
        qualityProfiles={qualityProfiles}
        targetPathOptions={targetPathOptions}
      />
      <RemoveTitleSection titleId={title.id} />
    </div>
  );
}

function episodeCode(episode: MediaLibraryTvEpisodeSummary) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function SeasonSection({
  season,
  titleId,
  targetPathOptions,
}: {
  season: MediaLibraryTvSeasonSummary;
  titleId: string;
  targetPathOptions: MediaLibraryPathOption[];
}) {
  return (
    <details className="overflow-hidden rounded-lg border border-line/60 bg-background/15" open={season.seasonNumber === 1}>
      <summary className="cursor-pointer px-4 py-3 transition hover:bg-panel-strong/45">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-lg text-foreground">
            {season.title ?? `Season ${season.seasonNumber}`}
          </span>
          <span className="text-sm text-muted">
            {season.availableEpisodeCount} of {season.episodeCount} episodes available / {season.monitored ? "Monitored" : "Unmonitored"}
          </span>
        </div>
      </summary>
      <div className="border-t border-line/60 px-4 py-3">
        <TvSeasonMonitoringForm seasonId={season.id} monitored={season.monitored} />
      </div>
      <ul className="divide-y divide-line/50 border-t border-line/60">
        {season.episodes.map((episode) => {
          const episodeQualityLabel = qualityLabel(episode.qualityLabels);
          const updatedLabel = episode.lastFileModifiedAt ? episode.lastFileModifiedAt.toLocaleDateString() : null;

          return (
            <li key={episode.id} className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[120px_minmax(0,1fr)_minmax(260px,auto)] xl:items-start">
              <span className="font-semibold text-foreground">{episodeCode(episode)}</span>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-foreground">{episode.title ?? `Episode ${episode.episodeNumber}`}</p>
                <p className="text-xs text-muted">
                  {episode.fileCount} file{episode.fileCount === 1 ? "" : "s"} / {episodeQualityLabel}
                  {updatedLabel ? ` / ${updatedLabel}` : ""}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    {episode.hasFile || episode.fileCount > 0 ? "Available" : "Missing"}
                  </span>
                  <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                    {episode.monitored ? "Monitored" : "Unmonitored"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <TvEpisodeMonitoringForm episodeId={episode.id} monitored={episode.monitored} />
                <LibraryItemSearchForm
                  titleId={titleId}
                  episodeId={episode.id}
                  label="Search episode"
                  targetPathOptions={targetPathOptions}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function TvDialog({
  title,
  qualityProfiles,
  targetPathOptions,
}: {
  title: MediaLibraryTvTitleDetails;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
}) {
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 flex-1 space-y-4">
          <DialogPills title={title} />
          {title.overview ? <p className="max-w-3xl text-sm leading-6 text-muted">{title.overview}</p> : null}
          <div className="grid gap-3 sm:grid-cols-4">
            <Fact label="Seasons" value={String(title.totals.seasons)} />
            <Fact label="Episodes" value={String(title.totals.episodes)} />
            <Fact label="Available" value={String(title.totals.availableEpisodes)} />
            <Fact label="Files" value={String(title.totals.files)} />
          </div>
        </div>
      </div>

      <DialogControls
        title={title}
        searchLabel="Search series"
        qualityProfiles={qualityProfiles}
        targetPathOptions={targetPathOptions}
      />

      <section className="space-y-3">
        <div>
          <h3 className="font-heading text-lg text-foreground">Seasons and episodes</h3>
        </div>
        <RequestMoreContentForm titleId={title.id} tmdbId={title.tmdbId} titleLabel={title.title} />
        {title.seasons.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
            No episodes have been discovered for this series yet.
          </p>
        ) : (
          <div className="space-y-3">
            {title.seasons.map((season) => (
              <SeasonSection
                key={season.id}
                season={season}
                titleId={title.id}
                targetPathOptions={targetPathOptions}
              />
            ))}
          </div>
        )}
      </section>

      <RemoveTitleSection titleId={title.id} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-background/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function LibraryTitleDialog(props: LibraryTitleDialogProps) {
  const dialogTitleId = `library-title-dialog-${props.title.id}`;

  return (
    <LibraryTitleDialogShell labelledBy={dialogTitleId} closeHref={props.closeHref}>
      <div className="border-b border-line/70 px-5 py-5 sm:px-6">
        <p className="font-heading text-sm italic text-accent">
          {props.mediaType === "tv" ? "TV series" : "Movie"}
        </p>
        <h2 id={dialogTitleId} className="mt-2 font-heading text-3xl leading-tight text-foreground">
          {titleLabel(props.title)}
        </h2>
      </div>
      {props.mediaType === "tv" ? (
        <TvDialog
          title={props.title}
          qualityProfiles={props.qualityProfiles}
          targetPathOptions={props.targetPathOptions}
        />
      ) : (
        <MovieDialog
          title={props.title}
          qualityProfiles={props.qualityProfiles}
          targetPathOptions={props.targetPathOptions}
        />
      )}
    </LibraryTitleDialogShell>
  );
}
