import { LibrarySearchWorkspace } from "@/components/library/library-search-workspace";

export const dynamic = "force-dynamic";

type SonarrPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

export default async function SonarrPage({ searchParams }: SonarrPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <LibrarySearchWorkspace
      serviceType="sonarr"
      routePath="/sonarr"
      title="Sonarr direct search"
      description="Search live Sonarr lookup results and open the standard request modal without waiting for a recommendation run first."
      searchQuery={resolvedSearchParams?.query}
    />
  );
}