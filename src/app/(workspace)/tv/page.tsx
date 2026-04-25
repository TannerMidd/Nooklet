import { RecommendationWorkspace } from "@/components/recommendations/recommendation-workspace";

export const dynamic = "force-dynamic";

type TvRecommendationsPageProps = {
  searchParams?: Promise<{
    run?: string;
    generated?: string;
  }>;
};

export default async function TvRecommendationsPage({ searchParams }: TvRecommendationsPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <RecommendationWorkspace
      mediaType="tv"
      routePath="/tv"
      title="TV recommendations"
      activeRunId={resolvedSearchParams?.run ?? null}
      wasJustGenerated={resolvedSearchParams?.generated === "1"}
    />
  );
}
