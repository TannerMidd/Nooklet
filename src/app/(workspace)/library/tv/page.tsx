import type { Metadata } from "next";

import {
    parseLibraryBrowseSearchParams,
    type LibraryBrowseSearchParamsInput,
} from "@/app/(workspace)/library/library-browse-search-params";
import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

type LibraryTvPageProps = {
    searchParams?: Promise<LibraryBrowseSearchParamsInput>;
};

export const metadata: Metadata = { title: "TV library" };

export default async function LibraryTvPage({ searchParams }: LibraryTvPageProps) {
    const resolvedSearchParams = parseLibraryBrowseSearchParams(await searchParams);

    return (
        <LibraryTitlePage
            mediaType="tv"
            query={resolvedSearchParams.q}
            page={resolvedSearchParams.page}
            detailsTitleId={resolvedSearchParams.details}
            status={resolvedSearchParams.status}
            monitored={
                resolvedSearchParams.monitored === "yes"
                    ? true
                    : resolvedSearchParams.monitored === "no"
                      ? false
                      : null
            }
            libraryId={resolvedSearchParams.library}
            sort={resolvedSearchParams.sort}
            view={resolvedSearchParams.view}
        />
    );
}
