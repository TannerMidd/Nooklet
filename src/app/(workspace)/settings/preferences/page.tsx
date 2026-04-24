import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function PreferencesSettingsPage() {
  return (
    <PlaceholderPage
      eyebrow="User preferences"
      title="Preferences"
      description="Recommendation defaults, history filters, and watch-history-only mode stay in an explicit preferences route instead of being mixed into account or service setup screens."
      moduleKey="preferences"
      acceptanceCriteria={[
        "History filters and recommendation defaults persist according to explicit preference rules.",
        "Watch-history-only mode is modeled as validated preference or request state rather than as screen-local branching.",
        "Settings remain separate from account, admin, and service-connection concerns.",
      ]}
      firstBuildSlice={[
        "Add preference read and update workflows with schema-backed validation.",
        "Persist history filters separately from recommendation items and sync state.",
        "Expose a query model that recommendation routes can consume without owning preference persistence.",
      ]}
      relatedLinks={[
        {
          href: "/history",
          label: "History",
          description: "Persisted filter preferences shape the history query surface.",
        },
        {
          href: "/settings/account",
          label: "Account",
          description: "Self-service account settings stay separate from preference management.",
        },
      ]}
    />
  );
}
