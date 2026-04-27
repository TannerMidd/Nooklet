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
      description="Browse Radarr movies, manage titles, and add new movies."
      directSearchTitle="Search Radarr"
      directSearchDescription="Find a movie and add it to Radarr."
      searchQuery={resolvedSearchParams?.query}
    />
  );
}