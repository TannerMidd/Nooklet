export type NavigationItem = {
  href: string;
  label: string;
  description: string;
};

export type NavigationGroup = {
  title: string;
  items: readonly NavigationItem[];
};

export const publicEntryPoints = [
  {
    href: "/login",
    label: "Local login",
    description: "Foundation route for session-backed local authentication.",
  },
  {
    href: "/bootstrap",
    label: "First-admin bootstrap",
    description: "One-time setup flow with no default admin password behavior.",
  },
] as const satisfies readonly NavigationItem[];

export const navigationGroups = [
  {
    title: "Recommendation flows",
    items: [
      {
        href: "/tv",
        label: "TV recommendations",
        description: "TV-specific recommendation requests and follow-up actions.",
      },
      {
        href: "/movies",
        label: "Movie recommendations",
        description: "Movie-specific recommendation requests and library actions.",
      },
      {
        href: "/history",
        label: "History",
        description: "Persisted recommendation history with explicit filters.",
      },
    ],
  },
  {
    title: "Setup and preferences",
    items: [
      {
        href: "/settings/account",
        label: "Account",
        description: "Password changes and user-scoped account controls.",
      },
      {
        href: "/settings/connections",
        label: "Connections",
        description: "Service connect, test, disconnect, and remote-user selection.",
      },
      {
        href: "/settings/preferences",
        label: "Preferences",
        description: "Filters, defaults, and watch-history source preferences.",
      },
      {
        href: "/settings/history",
        label: "History sources",
        description: "Sync and inspect watch-history sources used by recommendation workflows.",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/admin",
        label: "Admin",
        description: "Operational controls, users, roles, and audit views.",
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];
