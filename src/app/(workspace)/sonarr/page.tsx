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
      description="Browse the series Sonarr is tracking, filter in real time, and toggle which seasons should be monitored. Use the direct search tab to add new shows."
      directSearchTitle="Sonarr direct search"
      directSearchDescription="Search live Sonarr lookup results and open the standard request modal without waiting for a recommendation run first."
      searchQuery={resolvedSearchParams?.query}
      autoOpenSeriesId={autoOpenSeriesId}
      autoOpenMode={autoOpenMode}
    />
  );
}