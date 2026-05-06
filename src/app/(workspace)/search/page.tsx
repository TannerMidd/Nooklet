import { auth } from "@/auth";
import { TitleSearchForm } from "@/app/(workspace)/search/title-search-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const libraryOverview = await listLibraryOverview(session.user.id);
  const qualityProfiles = listMediaQualityProfiles();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Built-in search"
        title="Search"
        description="Find movies and shows first, then add them to your local library."
      />

      <Panel eyebrow="Titles" title="Search movies and TV">
        <TitleSearchForm
          libraries={libraryOverview.libraries.map((library) => ({
            id: library.id,
            name: library.name,
            mediaType: library.mediaType,
          }))}
          qualityProfiles={qualityProfiles}
        />
      </Panel>
    </div>
  );
}
