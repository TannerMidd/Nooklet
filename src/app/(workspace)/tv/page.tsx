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
      description="TV recommendation requests now create explicit persisted runs with normalized result items and a clean path into history and feedback flows."
      activeRunId={resolvedSearchParams?.run ?? null}
      wasJustGenerated={resolvedSearchParams?.generated === "1"}
    />
  );
}
