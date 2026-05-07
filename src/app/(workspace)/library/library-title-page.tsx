import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { MediaTitlePreferencesForm } from "@/app/(workspace)/library/media-title-preferences-form";
import {
  listMediaLibraryTitles,
  type MediaLibraryTitleSummary,
} from "@/modules/media-library/queries/list-media-library-titles";
import {
  getMediaQualityProfileLabel,
  listMediaQualityProfiles,
} from "@/modules/media-library/queries/list-media-quality-profiles";
import { type RecommendationMediaType } from "@/lib/database/schema";

function mediaTypeLabel(mediaType: RecommendationMediaType) {
  return mediaType === "tv" ? "TV library" : "Movie library";
}

function titleCountLabel(mediaType: RecommendationMediaType, count: number) {
  const label = mediaType === "tv" ? "series" : "movie";
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function TitleCard({ title }: { title: MediaLibraryTitleSummary }) {
  const qualityLabel = title.qualityLabels.length > 0 ? title.qualityLabels.join(" / ") : "No quality tag";
  const qualityProfiles = listMediaQualityProfiles();

  return (
    <li className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
      <div className="flex gap-4">
        <RecommendationPoster title={title.title} posterUrl={title.posterUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-heading text-lg leading-tight text-foreground">
              {title.title}{title.year ? ` (${title.year})` : ""}
            </p>
            <p className="text-sm text-muted">
              {title.libraryName ?? "Unassigned"} / {title.fileCount} file{title.fileCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1 capitalize">{title.status}</span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
              {title.monitored ? "Monitored" : "Unmonitored"}
            </span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
              {getMediaQualityProfileLabel(title.qualityProfile)}
            </span>
            <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">{qualityLabel}</span>
            {title.lastFileModifiedAt ? (
              <span className="rounded-lg border border-line/60 bg-background/20 px-2 py-1">
                {title.lastFileModifiedAt.toLocaleDateString()}
              </span>
            ) : null}
          </div>
          {title.overview ? <p className="line-clamp-2 text-sm leading-6 text-muted">{title.overview}</p> : null}
          <MediaTitlePreferencesForm
            titleId={title.id}
            monitored={title.monitored}
            qualityProfile={title.qualityProfile}
            qualityProfiles={qualityProfiles}
          />
        </div>
      </div>
    </li>
  );
}

export async function LibraryTitlePage({
  mediaType,
  query,
}: {
  mediaType: RecommendationMediaType;
  query?: string | null;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const library = await listMediaLibraryTitles(session.user.id, mediaType, query);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in library"
        title={mediaTypeLabel(mediaType)}
        description={mediaType === "tv" ? "Browse series discovered in local TV folders." : "Browse movies discovered in local movie folders."}
        actions={(
          <Link
            href="/library"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line/75 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70"
          >
            Manage folders
          </Link>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Titles</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.titles}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Files</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.files}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Monitored</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.monitored}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Missing</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{library.totals.missing}</p>
        </div>
      </div>

      <Panel eyebrow="Browse" title={titleCountLabel(mediaType, library.totals.titles)}>
        <form className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" action={mediaType === "tv" ? "/library/tv" : "/library/movies"}>
          <Input name="q" defaultValue={query ?? ""} placeholder={mediaType === "tv" ? "Filter series" : "Filter movies"} />
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
        {library.titles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
            No titles found.
          </p>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {library.titles.map((title) => <TitleCard key={title.id} title={title} />)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
