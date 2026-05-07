import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { LibraryItemSearchForm } from "@/app/(workspace)/library/library-item-search-form";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import { RemoveMediaTitleForm } from "@/app/(workspace)/library/remove-media-title-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getMediaLibraryMovieTitleDetails } from "@/modules/media-library/queries/get-media-library-movie-title-details";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import {
  getMediaQualityProfileLabel,
  listMediaQualityProfiles,
} from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  titleId: z.string().min(1),
});

type LibraryMovieTitlePageProps = {
  params: Promise<{ titleId: string }>;
};

function fileSummary(title: Awaited<ReturnType<typeof getMediaLibraryMovieTitleDetails>>) {
  if (!title || title.fileCount === 0) {
    return "No local file recorded";
  }

  const qualityLabel = title.qualityLabels.length > 0 ? title.qualityLabels.join(" / ") : "No quality tag";
  const modifiedLabel = title.lastFileModifiedAt ? title.lastFileModifiedAt.toLocaleDateString() : "Unknown date";

  return `${title.fileCount} file${title.fileCount === 1 ? "" : "s"} / ${qualityLabel} / ${modifiedLabel}`;
}

export default async function LibraryMovieTitlePage({ params }: LibraryMovieTitlePageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { titleId } = paramsSchema.parse(await params);
  const title = await getMediaLibraryMovieTitleDetails(session.user.id, titleId);

  if (!title) {
    notFound();
  }

  const qualityProfiles = listMediaQualityProfiles();
  const targetPathOptions = (await listMediaLibraryPathOptions(session.user.id)).filter((option) => (
    option.mediaType === "movie" && (title.libraryId ? option.libraryId === title.libraryId : true)
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Movie library"
        title={`${title.title}${title.year ? ` (${title.year})` : ""}`}
        description="Manage the local movie record and queue a fresh search."
        actions={(
          <Link
            href="/library/movies"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Back to movie library
          </Link>
        )}
      />

      <Panel eyebrow="Movie" title="Overview">
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
            <p className="text-sm text-muted">{fileSummary(title)}</p>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Controls" title="Settings and search">
        <div className="space-y-4">
          <MediaTitlePreferencesForm
            titleId={title.id}
            monitored={title.monitored}
            qualityProfile={title.qualityProfile}
            qualityProfiles={qualityProfiles}
          />
          <LibraryItemSearchForm
            titleId={title.id}
            label="Search movie"
            targetPathOptions={targetPathOptions}
          />
        </div>
      </Panel>

      <Panel eyebrow="Remove" title="Library record">
        <RemoveMediaTitleForm titleId={title.id} />
      </Panel>
    </div>
  );
}
