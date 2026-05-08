import { auth } from "@/auth";
import Link from "next/link";
import { LibraryPathForm } from "@/app/(workspace)/library/library-path-form";
import { LibraryPathManager } from "@/app/(workspace)/library/library-path-manager";
import { LibraryMonitoringControls } from "@/app/(workspace)/library/library-monitoring-controls";
import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  listLibraryOverview,
  type LibrarySummary,
} from "@/modules/media-library/queries/list-library-overview";

export const dynamic = "force-dynamic";

function mediaTypeLabel(mediaType: LibrarySummary["mediaType"]) {
  return mediaType === "tv" ? "TV" : "Movies";
}

function LibraryList({ libraries }: { libraries: LibrarySummary[] }) {
  if (libraries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
        No folders attached yet.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {libraries.map((library) => (
        <li key={library.id} className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="font-heading text-lg leading-tight text-foreground">{library.name}</p>
              <p className="text-sm text-muted">
                {mediaTypeLabel(library.mediaType)} / {library.pathCount} folder
                {library.pathCount === 1 ? "" : "s"} / {library.titleCount} title
                {library.titleCount === 1 ? "" : "s"} / {library.fileCount} file
                {library.fileCount === 1 ? "" : "s"}
              </p>
            </div>
            <span className="w-fit rounded-lg border border-line/70 bg-background/25 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {library.isDefault ? "Default" : "Library"}
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {library.paths.map((entry) => (
              <LibraryPathManager key={entry.id} library={library} path={entry} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default async function LibraryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const overview = await listLibraryOverview(session.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in library"
        title="Library"
        description="Manage local movie and TV folders for the standalone Nooklet media stack."
        actions={<LibraryScanButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Libraries</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{overview.totals.libraries}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{overview.totals.paths}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Titles</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{overview.totals.titles}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-panel/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Files</p>
          <p className="mt-2 font-heading text-3xl text-foreground">{overview.totals.files}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/library/movies"
          className="rounded-lg border border-line/70 bg-panel-strong/60 p-4 text-sm text-foreground transition hover:border-accent/45 hover:bg-panel-raised/70"
        >
          <span className="font-heading text-lg">Browse movie library</span>
          <span className="mt-1 block text-muted">Open discovered local movies.</span>
        </Link>
        <Link
          href="/library/tv"
          className="rounded-lg border border-line/70 bg-panel-strong/60 p-4 text-sm text-foreground transition hover:border-accent/45 hover:bg-panel-raised/70"
        >
          <span className="font-heading text-lg">Browse TV library</span>
          <span className="mt-1 block text-muted">Open discovered local series.</span>
        </Link>
      </div>

      <Panel eyebrow="Monitoring" title="Library monitoring">
        <LibraryMonitoringControls
          monitoredCount={overview.totals.monitored}
          titleCount={overview.totals.titles}
        />
      </Panel>

      <Panel eyebrow="Folders" title="Attach a library folder">
        <LibraryPathForm />
      </Panel>

      <Panel eyebrow="Overview" title="Attached libraries">
        <LibraryList libraries={overview.libraries} />
      </Panel>
    </div>
  );
}
