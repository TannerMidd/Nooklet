import { z } from "zod";

import { LibraryTitlePage } from "@/app/(workspace)/library/library-title-page";

export const dynamic = "force-dynamic";

const searchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  details: z.string().uuid().optional(),
});

type LibraryTvPageProps = {
  searchParams?: Promise<{ q?: string; page?: string; details?: string }>;
};

export default async function LibraryTvPage({ searchParams }: LibraryTvPageProps) {
  const resolvedSearchParams = searchParamsSchema.parse(await searchParams ?? {});

  return (
    <LibraryTitlePage
      mediaType="tv"
      query={resolvedSearchParams.q}
      page={resolvedSearchParams.page}
      detailsTitleId={resolvedSearchParams.details}
    />
  );
}
