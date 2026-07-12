import { auth } from "@/auth";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { LibraryPathForm } from "@/app/(workspace)/library/library-path-form";
import { LibraryPathManager } from "@/app/(workspace)/library/library-path-manager";
import { LibraryMonitoringControls } from "@/app/(workspace)/library/library-monitoring-controls";
import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { LibraryDrivesPanel } from "@/app/(workspace)/library/library-drives-panel";
import { LibraryScanSettingsForm } from "@/app/(workspace)/library/library-scan-settings-form";
import { MetadataRefreshSettingsForm } from "@/app/(workspace)/library/metadata-refresh-settings-form";
import { MissingSearchSettingsForm } from "@/app/(workspace)/library/missing-search-settings-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import {
  listLibraryOverview,
  type LibrarySummary,
} from "@/modules/media-library/queries/list-library-overview";
import { getLibraryDriveOverview } from "@/modules/media-library/queries/get-library-drive-overview";
import { getLibraryScanSettings } from "@/modules/media-library/queries/get-library-scan-settings";
import { getMetadataRefreshSettings } from "@/modules/media-library/queries/get-metadata-refresh-settings";
import { getMissingSearchSettings } from "@/modules/media-library/queries/get-missing-search-settings";

export const dynamic = "force-dynamic";

function mediaTypeLabel(mediaType: LibrarySummary["mediaType"]) {
  return mediaType === "tv" ? "TV" : "Movies";
}

function LibraryList({ libraries }: { libraries: LibrarySummary[] }) {
  if (libraries.length === 0) {
    return <EmptyState message="No folders attached yet." />;
  }

  return (
    <ul className="space-y-4">
      {libraries.map((library) => (
        <li key={library.id} className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3.5 py-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className="text-base font-semibold leading-tight text-foreground">{library.name}</p>
            {library.isDefault ? <Badge variant="accent">Default</Badge> : null}
            <p className="text-xs text-muted">
              {mediaTypeLabel(library.mediaType)} · {library.pathCount} folder
              {library.pathCount === 1 ? "" : "s"} · {library.titleCount} title
              {library.titleCount === 1 ? "" : "s"} · {library.fileCount} file
              {library.fileCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-3 hidden gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted lg:grid lg:grid-cols-[minmax(100px,0.7fr)_110px_minmax(120px,0.8fr)_minmax(220px,1.6fr)_105px_auto]">
            <span>Label</span>
            <span>Media</span>
            <span>Library</span>
            <span>Folder path</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="mt-1">
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

  const [overview, scanSettings, missingSearchSettings, metadataRefreshSettings, driveEntries] = await Promise.all([
    listLibraryOverview(session.user.id),
    getLibraryScanSettings(session.user.id),
    getMissingSearchSettings(session.user.id),
    getMetadataRefreshSettings(session.user.id),
    getLibraryDriveOverview(session.user.id),
  ]);

  const movieLibraries = overview.libraries.filter((library) => library.mediaType === "movie");
  const tvLibraries = overview.libraries.filter((library) => library.mediaType === "tv");
  const sumCounts = (libraries: LibrarySummary[], key: "titleCount" | "fileCount") =>
    libraries.reduce((total, library) => total + library[key], 0);

  return (
    <div className="nk-enter space-y-8">
      <PageHeader
        eyebrow="Local media stack"
        title="Library"
        actions={<LibraryScanButton />}
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Libraries" value={overview.totals.libraries} />
        <StatCard label="Folders" value={overview.totals.paths} />
        <StatCard label="Titles" value={overview.totals.titles} />
        <StatCard label="Files" value={overview.totals.files} />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Link
          href="/library/movies"
          className="relative flex items-center justify-between gap-3 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] bg-[linear-gradient(120deg,rgba(232,165,80,0.10),transparent_60%)] p-5 transition hover:-translate-y-0.5 hover:border-cream/[0.16]"
        >
          <LinkPendingOverlay />
          <span>
            <span className="block font-heading text-[21px] text-foreground">Movie library</span>
            <span className="mt-1 block text-[13px] text-muted">
              {sumCounts(movieLibraries, "titleCount")} titles · {sumCounts(movieLibraries, "fileCount")} files
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        </Link>
        <Link
          href="/library/tv"
          className="relative flex items-center justify-between gap-3 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] bg-[linear-gradient(120deg,rgba(127,181,164,0.10),transparent_60%)] p-5 transition hover:-translate-y-0.5 hover:border-cream/[0.16]"
        >
          <LinkPendingOverlay />
          <span>
            <span className="block font-heading text-[21px] text-foreground">TV library</span>
            <span className="mt-1 block text-[13px] text-muted">
              {sumCounts(tvLibraries, "titleCount")} titles · {sumCounts(tvLibraries, "fileCount")} files
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      </div>

      <Panel
        eyebrow="Storage"
        title="Drives & download defaults"
        description="Free space per library folder, and where downloads land when no folder is picked."
      >
        <LibraryDrivesPanel entries={driveEntries} />
      </Panel>

      <Panel eyebrow="Monitoring" title="Library monitoring">
        <LibraryMonitoringControls
          monitoredCount={overview.totals.monitored}
          titleCount={overview.totals.titles}
        />
      </Panel>

      <Panel eyebrow="Scanning" title="Library scan schedule">
        <LibraryScanSettingsForm settings={scanSettings} />
      </Panel>

      <Panel eyebrow="Automation" title="Missing-content search">
        <MissingSearchSettingsForm settings={missingSearchSettings} />
      </Panel>

      <Panel eyebrow="Automation" title="Series metadata refresh">
        <MetadataRefreshSettingsForm settings={metadataRefreshSettings} />
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
