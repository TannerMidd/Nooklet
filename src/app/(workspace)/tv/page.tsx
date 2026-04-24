import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function TvRecommendationsPage() {
  return (
    <PlaceholderPage
      eyebrow="Recommendation mode"
      title="TV recommendations"
      description="TV recommendation requests deserve their own route flow, their own validation surface, and a shared workflow core that does not depend on page-local branches."
      moduleKey="recommendations"
      acceptanceCriteria={[
        "TV recommendations run on a dedicated route rather than as a branch inside a general screen component.",
        "The server validates prerequisites for AI, media services, and history-source mode before a run starts.",
        "Persisted runs support normalized results, feedback, retries, and TV-specific add-to-library actions.",
      ]}
      firstBuildSlice={[
        "Define a create-run command and run-detail query for TV mode.",
        "Model recommendation phases explicitly: request validation, source preparation, prompt construction, execution, normalization, and persistence.",
        "Keep Sonarr-specific add actions downstream of the normalized item model rather than inside the route component.",
      ]}
      relatedLinks={[
        {
          href: "/movies",
          label: "Movie recommendations",
          description: "Parallel route using the same workflow core with movie-specific follow-up actions.",
        },
        {
          href: "/settings/connections",
          label: "Connections",
          description: "Service readiness and provider setup feed into recommendation prerequisites.",
        },
      ]}
    />
  );
}
