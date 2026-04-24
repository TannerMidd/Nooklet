import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function ConnectionsSettingsPage() {
  return (
    <PlaceholderPage
      eyebrow="Service setup"
      title="Connections"
      description="External providers are configured through explicit connect, test, disconnect, and status workflows. Secrets and remote-user selections stay out of generic browser state."
      moduleKey="service-connections"
      acceptanceCriteria={[
        "Each supported service has explicit connect, test, disconnect, and status workflows with validated inputs.",
        "Remote-user selection is persisted separately from raw secrets for providers that support it.",
        "Credential ownership and masking rules remain explicit instead of hiding behind service-name branches.",
      ]}
      firstBuildSlice={[
        "Define typed provider capability contracts before wiring any vendor-specific adapter.",
        "Split connection state, secret storage, and remote-user selection into separate domain concerns.",
        "Add a connection summary query that returns user-readable status without exposing secrets.",
      ]}
      relatedLinks={[
        {
          href: "/settings/preferences",
          label: "Preferences",
          description: "History-source and recommendation defaults depend on configured services.",
        },
        {
          href: "/tv",
          label: "TV recommendations",
          description: "Recommendation prerequisites depend on verified services.",
        },
      ]}
    />
  );
}
