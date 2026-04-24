import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function AccountSettingsPage() {
  return (
    <PlaceholderPage
      eyebrow="User settings"
      title="Account"
      description="Account settings are user-scoped and stay separate from admin controls, service setup, and general preferences. This is where password changes and account-level profile actions belong."
      moduleKey="users"
      acceptanceCriteria={[
        "Signed-in users can change their own password with current-password verification.",
        "Success and error handling stay scoped to the active user rather than to a global settings hub.",
        "User lifecycle policy remains explicit and separate from administrator-owned actions.",
      ]}
      firstBuildSlice={[
        "Add user-scoped account queries and password change command handlers.",
        "Keep credential validation and hashing logic in the users and identity-access modules, not in the route.",
        "Return structured validation and policy errors that the UI can map cleanly.",
      ]}
      relatedLinks={[
        {
          href: "/settings/preferences",
          label: "Preferences",
          description: "User-facing defaults and filters stay in a separate route flow.",
        },
        {
          href: "/admin",
          label: "Admin",
          description: "Admin-owned account management remains distinct from self-service account changes.",
        },
      ]}
    />
  );
}
