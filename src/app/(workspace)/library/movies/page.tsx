import { z } from "zod";

import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

type LibraryMoviesPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function LibraryMoviesPage({ searchParams }: LibraryMoviesPageProps) {
  const resolvedSearchParams = searchParamsSchema.parse(await searchParams ?? {});

  return <LibraryTitlePage mediaType="movie" query={resolvedSearchParams?.q} />;
}
