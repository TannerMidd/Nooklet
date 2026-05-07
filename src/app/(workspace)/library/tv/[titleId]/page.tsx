import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { TvEpisodeMonitoringForm } from "@/app/(workspace)/library/tv-episode-monitoring-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getMediaLibraryTvTitleDetails } from "@/modules/media-library/queries/get-media-library-tv-title-details";
import {
  getMediaQualityProfileLabel,
  listMediaQualityProfiles,
} from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  titleId: z.string().min(1),
});

type LibraryTvTitlePageProps = {
  params: Promise<{ titleId: string }>;
};

function episodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

export default async function LibraryTvTitlePage({ params }: LibraryTvTitlePageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { titleId } = paramsSchema.parse(await params);
  const title = await getMediaLibraryTvTitleDetails(session.user.id, titleId);

  if (!title) {
    notFound();
  }

  const qualityProfiles = listMediaQualityProfiles();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="TV library"
        title={`${title.title}${title.year ? ` (${title.year})` : ""}`}
        description="Manage the local series record and review discovered episodes."
        actions={(
          <Link
            href="/library/tv"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Back to TV library
          </Link>
        )}
      />

      <Panel eyebrow="Series" title="Overview">
        <div className="flex flex-col gap-5 md:flex-row">
          <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
          <div className="min-w-0 flex-1 space-y-4">
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
            {title.overview ? <p className="max-w-3xl text-sm leading-6 text-muted">{title.overview}</p> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line/60 bg-background/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Seasons</p>
                <p className="mt-1 font-heading text-2xl text-foreground">{title.totals.seasons}</p>
              </div>
              <div className="rounded-lg border border-line/60 bg-background/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Episodes</p>
                <p className="mt-1 font-heading text-2xl text-foreground">{title.totals.episodes}</p>
              </div>
              <div className="rounded-lg border border-line/60 bg-background/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Available</p>
                <p className="mt-1 font-heading text-2xl text-foreground">{title.totals.availableEpisodes}</p>
              </div>
              <div className="rounded-lg border border-line/60 bg-background/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Files</p>
                <p className="mt-1 font-heading text-2xl text-foreground">{title.totals.files}</p>
              </div>
            </div>
            <MediaTitlePreferencesForm
              titleId={title.id}
              monitored={title.monitored}
              qualityProfile={title.qualityProfile}
              qualityProfiles={qualityProfiles}
            />
            <LibraryItemSearchForm titleId={title.id} label="Search series" />
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Episodes" title="Seasons">
        {title.seasons.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
            No episodes have been discovered for this series yet.
          </p>
        ) : (
          <div className="space-y-5">
            {title.seasons.map((season) => (
              <section key={season.id} className="space-y-3 rounded-lg border border-line/70 bg-panel-strong/45 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="font-heading text-xl text-foreground">
                      {season.title ?? `Season ${season.seasonNumber}`}
                    </h2>
                    <p className="text-sm text-muted">
                      {season.availableEpisodeCount} of {season.episodeCount} episodes available
                    </p>
                  </div>
                  <span className="w-fit rounded-lg border border-line/60 bg-background/20 px-2 py-1 text-xs text-muted">
                    {season.monitored ? "Monitored" : "Unmonitored"}
                  </span>
                </div>
                <ul className="divide-y divide-line/50 overflow-hidden rounded-lg border border-line/60 bg-background/15">
                  {season.episodes.map((episode) => {
                    const qualityLabel = episode.qualityLabels.length > 0 ? episode.qualityLabels.join(" / ") : "No quality tag";

                    return (
                      <li key={episode.id} className="grid gap-3 p-3 text-sm lg:grid-cols-[110px_minmax(0,1fr)_auto] lg:items-center">
                        <span className="font-semibold text-foreground">
                          {episodeCode(episode.seasonNumber, episode.episodeNumber)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{episode.title ?? `Episode ${episode.episodeNumber}`}</p>
                          <p className="text-xs text-muted">
                            {episode.fileCount} file{episode.fileCount === 1 ? "" : "s"} / {qualityLabel}
                            {episode.lastFileModifiedAt ? ` / ${episode.lastFileModifiedAt.toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2 text-xs text-muted">
                            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                              {episode.hasFile || episode.fileCount > 0 ? "Available" : "Missing"}
                            </span>
                            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                              {episode.monitored ? "Monitored" : "Unmonitored"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-start gap-2">
                            <TvEpisodeMonitoringForm episodeId={episode.id} monitored={episode.monitored} />
                            <LibraryItemSearchForm
                              titleId={title.id}
                              episodeId={episode.id}
                              label="Search episode"
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}