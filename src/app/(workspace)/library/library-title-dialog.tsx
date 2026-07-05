import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { LibraryTitleDialogShell } from "@/app/(workspace)/library/library-title-dialog-shell";
import { LinkLibraryTitleTmdbOnMount } from "@/app/(workspace)/library/link-library-title-tmdb-on-mount";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import { TvSeasonsList } from "@/app/(workspace)/library/tv-seasons-list";
import { RequestMoreContentForm } from "@/app/(workspace)/library/request-more-content-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { type MediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import { type MediaLibraryTvTitleSummary } from "@/modules/media-library/queries/get-media-library-tv-title-summary";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  getMediaQualityProfileLabel,
  type MediaQualityProfileOption,
} from "@/modules/media-library/queries/list-media-quality-profiles";

type LibraryTitleDialogProps = {
  closeHref: string;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
} & (
  | { mediaType: "movie"; title: MediaLibraryMovieTitleDetails }
  | { mediaType: "tv"; title: MediaLibraryTvTitleSummary }
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
      <span className="rounded-md border border-line/50 bg-background/25 px-1.5 py-0.5 capitalize">{title.status}</span>
      <span className="rounded-md border border-line/50 bg-background/25 px-1.5 py-0.5">
        {title.monitored ? "Monitored" : "Unmonitored"}
      </span>
      <span className="rounded-md border border-line/50 bg-background/25 px-1.5 py-0.5">
        {getMediaQualityProfileLabel(title.qualityProfile)}
      </span>
      <span className="rounded-md border border-line/50 bg-background/25 px-1.5 py-0.5">
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
  currentLibraryPathId,
}: {
  title: { id: string; monitored: boolean; qualityProfile: MediaQualityProfileOption["value"] };
  searchLabel: string;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
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
        currentLibraryPathId={currentLibraryPathId}
      />
    </section>
  );
}

function RemoveTitleSection({ titleId }: { titleId: string }) {
  return (
    <section className="space-y-3 rounded-lg border border-accent-wine/35 bg-accent-wine/5 p-4">
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
  currentLibraryPathId,
}: {
  title: MediaLibraryMovieTitleDetails;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
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
        currentLibraryPathId={currentLibraryPathId}
      />
      <RemoveTitleSection titleId={title.id} />
    </div>
  );
}

function TvDialog({
  title,
  qualityProfiles,
  targetPathOptions,
  currentLibraryPathId,
}: {
  title: MediaLibraryTvTitleSummary;
  qualityProfiles: readonly MediaQualityProfileOption[];
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId: string | null;
}) {
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <LinkLibraryTitleTmdbOnMount titleId={title.id} hasTmdbId={title.tmdbId !== null} />
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
        currentLibraryPathId={currentLibraryPathId}
      />

      <section className="space-y-3">
        <div>
          <h3 className="font-heading text-lg text-foreground">Seasons and episodes</h3>
        </div>
        <RequestMoreContentForm
          titleId={title.id}
          tmdbId={title.tmdbId}
          titleLabel={title.title}
          monitoredSeasons={title.seasons.filter((season) => season.monitored).map((season) => season.seasonNumber)}
          monitoredEpisodes={title.monitoredEpisodes}
        />
        <TvSeasonsList
          titleId={title.id}
          seasons={title.seasons}
          targetPathOptions={targetPathOptions}
          currentLibraryPathId={currentLibraryPathId}
        />
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
        <h2 id={dialogTitleId} className="mt-1.5 font-heading text-2xl leading-tight text-foreground">
          {titleLabel(props.title)}
        </h2>
      </div>
      {props.mediaType === "tv" ? (
        <TvDialog
          title={props.title}
          qualityProfiles={props.qualityProfiles}
          targetPathOptions={props.targetPathOptions}
          currentLibraryPathId={props.currentLibraryPathId}
        />
      ) : (
        <MovieDialog
          title={props.title}
          qualityProfiles={props.qualityProfiles}
          targetPathOptions={props.targetPathOptions}
          currentLibraryPathId={props.currentLibraryPathId}
        />
      )}
    </LibraryTitleDialogShell>
  );
}
