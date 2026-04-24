import { RecommendationWorkspace } from "@/components/recommendations/recommendation-workspace";

export const dynamic = "force-dynamic";

export default function TvRecommendationsPage() {
  return (
    <RecommendationWorkspace
      mediaType="tv"
      routePath="/tv"
      title="TV recommendations"
      description="TV recommendation requests now create explicit persisted runs with normalized result items and a clean path into history and feedback flows."
    />
  );
}
