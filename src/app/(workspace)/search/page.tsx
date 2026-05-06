import { auth } from "@/auth";
import { IndexerSearchForm } from "@/app/(workspace)/search/indexer-search-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in search"
        title="Search"
        description="Search configured Newznab and Torznab indexers without Sonarr or Radarr."
      />

      <Panel eyebrow="Indexers" title="Search releases">
        <IndexerSearchForm />
      </Panel>
    </div>
  );
}
