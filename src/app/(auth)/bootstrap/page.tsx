import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function BootstrapPage() {
  return (
    <PlaceholderPage
      eyebrow="Identity foundation"
      title="First-admin bootstrap"
      description="Fresh installs need an explicit, one-time administrator bootstrap. The flow must disappear after the first admin is created and must never rely on a default password."
      moduleKey="identity-access"
      acceptanceCriteria={[
        "Fresh installs expose a one-time bootstrap flow for the first administrator.",
        "The bootstrap flow disables itself after the first admin exists.",
        "No default admin password or hidden fallback behavior is allowed.",
      ]}
      firstBuildSlice={[
        "Add a bootstrap status query that decides whether the route is still available.",
        "Implement an explicit command for creating the first administrator with auditable side effects.",
        "Redirect completed installs to local login once bootstrap closes.",
      ]}
      relatedLinks={[
        {
          href: "/login",
          label: "Login",
          description: "Normal local sign-in flow after bootstrap is complete.",
        },
        {
          href: "/admin",
          label: "Admin",
          description: "Protected operational surface once an admin exists.",
        },
      ]}
    />
  );
}
