import { RecommendationWorkspace } from "@/components/recommendations/recommendation-workspace";

export const dynamic = "force-dynamic";

export default function MovieRecommendationsPage() {
  return (
    <RecommendationWorkspace
      mediaType="movie"
      routePath="/movies"
      title="Movie recommendations"
      description="Movie recommendation requests now share the same run workflow core while keeping the route, downstream status, and history views separate from TV mode."
    />
  );
}
