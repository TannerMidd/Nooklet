import type { Metadata } from "next";
import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";

import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { StatStrip } from "@/components/ui/stat-card";
import {
  listLibraryOverview,
  type LibrarySummary,
} from "@/modules/media-library/queries/list-library-overview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Library" };

function sumCounts(libraries: LibrarySummary[], key: "titleCount" | "fileCount") {
  return libraries.reduce((total, library) => total + library[key], 0);
}

function LibraryDestinationCard({
  href,
  title,
  description,
  tone,
}: {
  href: string;
  title: string;
  description: string;
  tone: "warm" | "cool";
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center justify-between gap-3 rounded-2xl border border-cream/[0.08] p-[22px] transition hover:-translate-y-0.5 hover:border-cream/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${tone === "warm" ? "bg-[linear-gradient(120deg,rgba(232,165,80,0.10),transparent_60%),rgba(255,244,230,0.03)]" : "bg-[linear-gradient(120deg,rgba(127,181,164,0.10),transparent_60%),rgba(255,244,230,0.03)]"}`}
    >
      <LinkPendingOverlay />
      <span>
        <span className="block font-heading text-[21px] text-foreground">{title}</span>
        <span className="mt-1 block text-[13px] text-muted">{description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}

export default async function LibraryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const overview = await listLibraryOverview(session.user.id);
  const movieLibraries = overview.libraries.filter((library) => library.mediaType === "movie");
  const tvLibraries = overview.libraries.filter((library) => library.mediaType === "tv");

  return (
    <div className="nk-enter space-y-8">
      <PageHeader
        eyebrow="Your media"
        title="Library"
        description="Browse movies and series here. Storage, folder administration, and automation live in Settings."
        actions={(
          <div className="flex flex-wrap gap-2">
            <LibraryScanButton />
            <Link
              href="/settings/storage"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-cream/[0.14] bg-cream/[0.03] px-4 py-2 text-sm font-semibold text-foreground hover:bg-cream/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Settings aria-hidden="true" className="h-4 w-4" /> Storage
            </Link>
          </div>
        )}
      />

      <StatStrip
        entries={[
          { label: "Libraries", value: overview.totals.libraries },
          { label: "Titles", value: overview.totals.titles },
          { label: "Media files", value: overview.totals.files },
          { label: "Monitored", value: overview.totals.monitored },
        ]}
      />

      {overview.totals.paths === 0 && overview.totals.titles === 0 ? (
        <EmptyState
          message="No media folders are attached yet. Finish Storage setup before scanning a library or requesting a download."
          action={(
            <Link href="/settings/storage" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground">
              Set up storage
            </Link>
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <LibraryDestinationCard
            href="/library/movies"
            title="Movies"
            description={`${sumCounts(movieLibraries, "titleCount")} titles · ${sumCounts(movieLibraries, "fileCount")} files`}
            tone="warm"
          />
          <LibraryDestinationCard
            href="/library/tv"
            title="TV series"
            description={`${sumCounts(tvLibraries, "titleCount")} series · ${sumCounts(tvLibraries, "fileCount")} files`}
            tone="cool"
          />
        </div>
      )}
    </div>
  );
}
