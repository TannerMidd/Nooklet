import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function LoginPage() {
  return (
    <PlaceholderPage
      eyebrow="Identity foundation"
      title="Local login"
      description="Local login remains a first-class flow in phase 1. This route is where Auth.js-backed credentials, session persistence, and clean unauthorized redirects will land."
      moduleKey="identity-access"
      acceptanceCriteria={[
        "Users can sign in locally and receive a persistent per-user session.",
        "Unauthorized routes redirect or reject cleanly on the server and in the UI.",
        "The login flow stays separate from admin, service setup, and account settings concerns.",
      ]}
      firstBuildSlice={[
        "Add a local credentials provider and explicit session guard helpers.",
        "Keep route logic thin and move authentication rules into the identity-access module.",
        "Map validation and auth failures into user-readable form errors without leaking policy details.",
      ]}
      relatedLinks={[
        {
          href: "/bootstrap",
          label: "Bootstrap",
          description: "One-time first-admin creation flow.",
        },
        {
          href: "/admin",
          label: "Admin",
          description: "Protected route surface for user and audit management.",
        },
      ]}
    />
  );
}
