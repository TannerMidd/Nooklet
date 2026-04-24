import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function AdminPage() {
  return (
    <PlaceholderPage
      eyebrow="Operations"
      title="Admin"
      description="Administrative actions need their own protected surface for user management, audit visibility, and privileged operational controls. This route is separate from account and setup flows by design."
      moduleKey="admin"
      acceptanceCriteria={[
        "Admin-only routes and actions remain restricted on both the server and the UI.",
        "Admins can manage users, roles, account status, and other operational controls subject to policy.",
        "Sensitive changes and workflow operations are traceable through audit events.",
      ]}
      firstBuildSlice={[
        "Add server-enforced admin guards before any admin UI mutations are implemented.",
        "Introduce audit event persistence for bootstrap, credential changes, connection changes, and recommendation runs.",
        "Build user listing and role-management queries and commands behind explicit policy checks.",
      ]}
      relatedLinks={[
        {
          href: "/bootstrap",
          label: "Bootstrap",
          description: "First-admin creation is the entry point into the protected admin surface.",
        },
        {
          href: "/settings/account",
          label: "Account",
          description: "Self-service account changes remain outside the admin route.",
        },
      ]}
    />
  );
}