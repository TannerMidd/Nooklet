import type { Metadata } from "next";
import { z } from "zod";

import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  details: z.string().uuid().optional(),
  status: z.enum(["available", "requested", "missing"]).optional(),
  monitored: z.enum(["yes", "no"]).optional(),
  library: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  sort: z.enum(["title", "recent", "year", "status"]).catch("title"),
  view: z.enum(["list", "grid"]).catch("list"),
});

type LibraryMoviesPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

export const metadata: Metadata = { title: "Movie library" };

export default async function LibraryMoviesPage({ searchParams }: LibraryMoviesPageProps) {
  const resolvedSearchParams = searchParamsSchema.parse(await searchParams ?? {});

  return (
    <LibraryTitlePage
      mediaType="movie"
      query={resolvedSearchParams.q}
      page={resolvedSearchParams.page}
      detailsTitleId={resolvedSearchParams.details}
      status={resolvedSearchParams.status}
      monitored={resolvedSearchParams.monitored === "yes" ? true : resolvedSearchParams.monitored === "no" ? false : null}
      libraryId={resolvedSearchParams.library}
      sort={resolvedSearchParams.sort}
      view={resolvedSearchParams.view}
    />
  );
}
