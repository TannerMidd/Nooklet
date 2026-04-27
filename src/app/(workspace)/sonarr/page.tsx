import { LibraryBrowserWorkspace } from "@/components/library/library-browser-workspace";

export const dynamic = "force-dynamic";

type SonarrPageProps = {
  searchParams?: Promise<{
    query?: string;
    seriesId?: string;
    mode?: string;
  }>;
};

export default async function SonarrPage({ searchParams }: SonarrPageProps) {
  const resolvedSearchParams = await searchParams;

  const parsedSeriesId = Number.parseInt(resolvedSearchParams?.seriesId ?? "", 10);
  const autoOpenSeriesId =
    Number.isInteger(parsedSeriesId) && parsedSeriesId > 0 ? parsedSeriesId : null;
  const autoOpenMode = resolvedSearchParams?.mode === "episode" ? "episode" : "season";

  return (
    <LibraryBrowserWorkspace
      serviceType="sonarr"
      routePath="/sonarr"
      title="Sonarr library"
      description="Browse Sonarr series, adjust monitoring, and add new shows."
      directSearchTitle="Search Sonarr"
      directSearchDescription="Find a show and add it to Sonarr."
      searchQuery={resolvedSearchParams?.query}
      autoOpenSeriesId={autoOpenSeriesId}
      autoOpenMode={autoOpenMode}
    />
  );
}