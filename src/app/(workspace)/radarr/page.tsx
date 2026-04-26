import { LibrarySearchWorkspace } from "@/components/library/library-search-workspace";

export const dynamic = "force-dynamic";

type RadarrPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

export default async function RadarrPage({ searchParams }: RadarrPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LibrarySearchWorkspace
      serviceType="radarr"
      routePath="/radarr"
      title="Radarr direct search"
      description="Search live Radarr lookup results and open the standard request modal without waiting for a recommendation run first."
      searchQuery={resolvedSearchParams?.query}
    />
  );
}