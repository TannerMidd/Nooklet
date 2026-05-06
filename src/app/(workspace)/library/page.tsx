import { auth } from "@/auth";
import { LibraryPathForm } from "@/app/(workspace)/library/library-path-form";
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
              <li
                key={entry.id}
                className="grid gap-2 rounded-lg border border-line/60 bg-background/20 p-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{entry.label}</p>
                  <p className="break-all text-muted">{entry.path}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted md:justify-end">
                  <span className="rounded-lg border border-line/60 px-2 py-1 capitalize">{entry.status}</span>
                  <span>{entry.fileCount} file{entry.fileCount === 1 ? "" : "s"}</span>
                  {entry.lastScannedAt ? <span>{entry.lastScannedAt.toLocaleString()}</span> : null}
                </div>
              </li>
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

      <Panel eyebrow="Folders" title="Attach a library folder">
        <LibraryPathForm />
      </Panel>

      <Panel eyebrow="Overview" title="Attached libraries">
        <LibraryList libraries={overview.libraries} />
      </Panel>
    </div>
  );
}
