export type DomainModuleKey =
  | "identity-access"
  | "users"
  | "service-connections"
  | "credential-vault"
  | "watch-history"
  | "recommendations"
  | "discover"
  | "preferences"
  | "notifications"
  | "admin";

export type DomainModule = {
  key: DomainModuleKey;
  title: string;
  summary: string;
  responsibilities: readonly string[];
  workflows: readonly string[];
};

export const domainModules = [
  {
    key: "identity-access",
    title: "Identity and Access",
    summary: "Local login, session boundaries, policy checks, and bootstrap gating.",
    responsibilities: [
      "Local authentication and session lifecycle",
      "First-admin bootstrap rules",
      "Authorization checks for protected routes and actions",
    ],
    workflows: [
      "Sign in",
      "Sign out",
      "Create first administrator",
      "Guard protected routes",
    ],
  },
  {
    key: "users",
    title: "Users",
    summary: "User lifecycle management, password changes, and account status controls.",
    responsibilities: [
      "User account CRUD for admin operations",
      "Password change and reset workflows",
      "Role assignment and disable or enable policy",
    ],
    workflows: [
      "Create user",
      "Update role",
      "Disable account",
      "Change password",
    ],
  },
  {
    key: "service-connections",
    title: "Service Connections",
    summary: "Explicit connect, verify, disconnect, and status workflows for external services.",
    responsibilities: [
      "Connection setup and validation",
      "Connection verification and health state",
      "Remote-user selection for supported providers",
    ],
    workflows: [
      "Connect service",
      "Test connection",
      "Disconnect service",
      "Persist remote-user selection",
    ],
  },
  {
    key: "credential-vault",
    title: "Credential Vault",
    summary: "Secret ownership, encryption boundaries, masking, and read policy.",
    responsibilities: [
      "Secret storage and encryption",
      "Shared versus user-scoped ownership rules",
      "Masked read models for setup summaries",
    ],
    workflows: [
      "Store secret",
      "Rotate secret",
      "Resolve authorized secret access",
      "Mask secret summaries",
    ],
  },
  {
    key: "watch-history",
    title: "Watch History",
    summary: "Source sync, normalization, merge logic, and downstream query surfaces.",
    responsibilities: [
      "Adapter-backed sync workflows for each source",
      "Normalization and deduplication rules",
      "Persisted sync metadata and source configuration",
    ],
    workflows: [
      "Validate source",
      "Fetch source items",
      "Normalize and merge",
      "Persist sync run metadata",
    ],
  },
  {
    key: "recommendations",
    title: "Recommendations",
    summary: "Run creation, prompt assembly, normalization, feedback, retries, and history queries.",
    responsibilities: [
      "Recommendation run lifecycle",
      "Normalized recommendation item persistence",
      "Retry, feedback, and history query behavior",
    ],
    workflows: [
      "Validate request",
      "Prepare sources",
      "Execute model",
      "Normalize and persist results",
      "Capture feedback",
      "Retry failed or extended runs",
    ],
  },
  {
    key: "discover",
    title: "Discover",
    summary: "TMDB-powered browse rails for trending, popular, top-rated, and upcoming titles.",
    responsibilities: [
      "Compose discover rails from a verified TMDB connection",
      "Resolve TMDB title detail overviews for in-app preview",
    ],
    workflows: [
      "List discover rails",
      "Resolve title detail overview",
    ],
  },
  {
    key: "preferences",
    title: "Preferences",
    summary: "User-facing defaults, history filters, and recommendation behavior toggles.",
    responsibilities: [
      "Persist explicit user preferences",
      "Model history filters and watch-history-only mode",
      "Expose validated preference read and write workflows",
    ],
    workflows: [
      "Update preference",
      "Apply persisted history filters",
      "Resolve recommendation defaults",
    ],
  },
  {
    key: "notifications",
    title: "Notifications",
    summary: "Outbound notification channels and event dispatch for runs and sync failures.",
    responsibilities: [
      "Notification channel configuration and event subscriptions",
      "Event dispatch fan-out with delivery audit",
    ],
    workflows: [
      "Configure notification channel",
      "Dispatch event notification",
      "Test notification channel",
    ],
  },
  {
    key: "admin",
    title: "Admin",
    summary: "Operational controls, user oversight, audits, and privileged actions.",
    responsibilities: [
      "Admin-only route flows and actions",
      "Audit event queries and operational visibility",
      "Privileged user management and system controls",
    ],
    workflows: [
      "List users",
      "Review audit activity",
      "Perform admin-owned mutations",
    ],
  },
] as const satisfies readonly DomainModule[];

export function getDomainModule(key: DomainModuleKey) {
  const domainModule = domainModules.find((entry) => entry.key === key);

  if (!domainModule) {
    throw new Error(`Unknown domain module: ${key}`);
  }

  return domainModule;
}
