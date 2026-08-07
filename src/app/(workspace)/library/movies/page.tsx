import type { Metadata } from "next";

import {
    parseLibraryBrowseSearchParams,
    type LibraryBrowseSearchParamsInput,
} from "@/app/(workspace)/library/library-browse-search-params";
import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

type LibraryMoviesPageProps = {
    searchParams?: Promise<LibraryBrowseSearchParamsInput>;
};

export const metadata: Metadata = { title: "Movie library" };

export default async function LibraryMoviesPage({ searchParams }: LibraryMoviesPageProps) {
    const resolvedSearchParams = parseLibraryBrowseSearchParams(await searchParams);

    return (
        <LibraryTitlePage
            mediaType="movie"
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
