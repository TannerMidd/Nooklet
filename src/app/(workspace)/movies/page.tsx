import { RecommendationWorkspace } from "@/components/recommendations/recommendation-workspace";

export const dynamic = "force-dynamic";

type MovieRecommendationsPageProps = {
  searchParams?: Promise<{
    run?: string;
    generated?: string;
  }>;
};

export default async function MovieRecommendationsPage({
  searchParams,
}: MovieRecommendationsPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <RecommendationWorkspace
      mediaType="movie"
      routePath="/movies"
      title="Movie recommendations"
      activeRunId={resolvedSearchParams?.run ?? null}
      wasJustGenerated={resolvedSearchParams?.generated === "1"}
    />
  );
}
