import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function MovieRecommendationsPage() {
  return (
    <PlaceholderPage
      eyebrow="Recommendation mode"
      title="Movie recommendations"
      description="Movie recommendation requests stay on their own route, share the same run workflow core, and keep Radarr-specific follow-up actions out of the orchestration layer."
      moduleKey="recommendations"
      acceptanceCriteria={[
        "Movie recommendations run on a dedicated route with their own settings and add-to-library flow.",
        "The server blocks invalid runs when AI or media prerequisites are missing and returns actionable errors.",
        "Runs persist normalized recommendation items and remain retry-safe after failure or expansion.",
      ]}
      firstBuildSlice={[
        "Share the recommendation workflow core with TV mode while keeping route state and follow-up actions separate.",
        "Persist normalized movie items with enough metadata to support history, feedback, and retry behavior.",
        "Add a route-level query model for recent movie runs and their status.",
      ]}
      relatedLinks={[
        {
          href: "/tv",
          label: "TV recommendations",
          description: "Sibling route using the same workflow phases for a different media type.",
        },
        {
          href: "/history",
          label: "History",
          description: "Persisted runs and items surface here once recommendation workflows are live.",
        },
      ]}
    />
  );
}
