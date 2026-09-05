import { auth } from "@/auth";
import { TitleSearchForm } from "@/app/(workspace)/search/title-search-form";
import {
    parseSearchPageParams,
    type SearchPageParams,
} from "@/app/(workspace)/search/search-page-state";
import { PageHeader } from "@/components/ui/page-header";
import { searchDiscoverTitles } from "@/modules/discover/queries/search-discover-titles";
import { searchDiscoverTitlesInputSchema } from "@/modules/discover/schemas/title-search";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

type SearchPageProps = {
    searchParams?: Promise<SearchPageParams>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const params = parseSearchPageParams(await searchParams);
    const parsedSearch = searchDiscoverTitlesInputSchema.safeParse(params);
    const [libraryOverview, pathOptions, titleSearch] = await Promise.all([
        listLibraryOverview(session.user.id),
        listMediaLibraryPathOptions(session.user.id),
        params.query
            ? parsedSearch.success
                ? searchDiscoverTitles(session.user.id, parsedSearch.data)
                : Promise.resolve(null)
            : Promise.resolve(null),
    ]);
    const qualityProfiles = listMediaQualityProfiles();
    const initialState = !params.query
        ? { status: "idle" as const, message: null, results: [] }
        : !parsedSearch.success
          ? {
                status: "error" as const,
                message:
                    parsedSearch.error.issues[0]?.message ?? "Review the search and try again.",
                results: [],
            }
          : titleSearch?.ok
            ? {
                  status: "success" as const,
                  message: `${titleSearch.titles.length} title${titleSearch.titles.length === 1 ? "" : "s"} found.`,
                  results: titleSearch.titles,
              }
            : {
                  status: "error" as const,
                  message: titleSearch?.message ?? "Nooklet could not search titles right now.",
                  reason: titleSearch && !titleSearch.ok ? titleSearch.reason : undefined,
                  results: [],
              };

    return (
        <div className="nk-enter space-y-8">
            <PageHeader eyebrow="Find & request" title="Search" />

            <TitleSearchForm
                initialQuery={params.query}
                initialMediaType={params.mediaType}
                initialState={initialState}
                libraries={libraryOverview.libraries.flatMap((library) =>
                    library.mediaType === "youtube"
                        ? []
                        : [{ id: library.id, name: library.name, mediaType: library.mediaType }],
                )}
                qualityProfiles={qualityProfiles}
                pathOptions={pathOptions}
            />
        </div>
    );
}
