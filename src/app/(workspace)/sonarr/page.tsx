import { LibraryBrowserWorkspace } from "@/components/library/library-browser-workspace";

export const dynamic = "force-dynamic";

type SonarrPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

export default async function SonarrPage({ searchParams }: SonarrPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LibraryBrowserWorkspace
      serviceType="sonarr"
      routePath="/sonarr"
      title="Sonarr library"
      description="Browse the series Sonarr is tracking, filter in real time, and toggle which seasons should be monitored. Use the direct search tab to add new shows."
      directSearchTitle="Sonarr direct search"
      directSearchDescription="Search live Sonarr lookup results and open the standard request modal without waiting for a recommendation run first."
      searchQuery={resolvedSearchParams?.query}
    />
  );
}