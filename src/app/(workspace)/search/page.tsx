import { auth } from "@/auth";
import { TitleSearchForm } from "@/app/(workspace)/search/title-search-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [libraryOverview, pathOptions] = await Promise.all([
    listLibraryOverview(session.user.id),
    listMediaLibraryPathOptions(session.user.id),
  ]);
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
          pathOptions={pathOptions}
        />
      </Panel>
    </div>
  );
}
