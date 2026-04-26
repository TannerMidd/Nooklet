import { LibraryBrowserWorkspace } from "@/components/library/library-browser-workspace";

export const dynamic = "force-dynamic";

type RadarrPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

export default async function RadarrPage({ searchParams }: RadarrPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LibraryBrowserWorkspace
      serviceType="radarr"
      routePath="/radarr"
      title="Radarr library"
      description="Browse the movies Radarr is tracking and filter in real time. Use the direct search tab to add new movies."
      directSearchTitle="Radarr direct search"
      directSearchDescription="Search live Radarr lookup results and open the standard request modal without waiting for a recommendation run first."
      searchQuery={resolvedSearchParams?.query}
    />
  );
}