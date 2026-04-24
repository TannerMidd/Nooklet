import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function HistoryPage() {
  return (
    <PlaceholderPage
      eyebrow="Recommendation records"
      title="History"
      description="History browsing needs persisted recommendation records, explicit filters, hidden state, and responsive pagination. It should not be backed by a generic blob or page-local state machine."
      moduleKey="recommendations"
      acceptanceCriteria={[
        "Users can browse previous TV, movie, and combined recommendation history from persisted run records.",
        "Filters for existing, liked, disliked, and hidden items are explicit and composable.",
        "Hidden state is stored separately from the recommendation item record and large result sets stay responsive.",
      ]}
      firstBuildSlice={[
        "Add paginated history queries with totals, filtered counts, and media-type scopes.",
        "Persist feedback and hidden-state mutations independently from the normalized recommendation item record.",
        "Keep metadata enrichment optional so the core history flow still works when external lookups fail.",
      ]}
      relatedLinks={[
        {
          href: "/tv",
          label: "TV recommendations",
          description: "Recommendation runs originate here for TV mode.",
        },
        {
          href: "/movies",
          label: "Movie recommendations",
          description: "Recommendation runs originate here for movie mode.",
        },
      ]}
    />
  );
}
