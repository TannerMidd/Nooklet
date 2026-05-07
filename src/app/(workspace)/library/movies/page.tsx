import { z } from "zod";

import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).catch(1),
});

type LibraryMoviesPageProps = {
  searchParams?: Promise<{ q?: string; page?: string }>;
};

export default async function LibraryMoviesPage({ searchParams }: LibraryMoviesPageProps) {
  const resolvedSearchParams = searchParamsSchema.parse(await searchParams ?? {});

  return <LibraryTitlePage mediaType="movie" query={resolvedSearchParams.q} page={resolvedSearchParams.page} />;
}
