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
    description: "Sign in with your Recommendarr account.",
  },
  {
    href: "/bootstrap",
    label: "First-admin bootstrap",
    description: "Set up the first administrator for a new install.",
  },
] as const satisfies readonly NavigationItem[];

export const navigationGroups = [
  {
    title: "Recommendations",
    items: [
      {
        href: "/tv",
        label: "TV recommendations",
        description: "Get TV picks based on your taste and manage them in one place.",
      },
      {
        href: "/movies",
        label: "Movie recommendations",
        description: "Get movie picks based on your taste and manage them in one place.",
      },
      {
        href: "/sonarr",
        label: "Sonarr library",
        description: "Browse your Sonarr library, filter in real time, and manage which seasons are monitored.",
      },
      {
        href: "/radarr",
        label: "Radarr library",
        description: "Browse your Radarr library and search Radarr directly to request a movie.",
      },
      {
        href: "/history",
        label: "History",
        description: "Review past recommendations, feedback, and library actions.",
      },
      {
        href: "/in-progress",
        label: "In progress",
        description: "Track active downloads.",
      },
      {
        href: "/analytics",
        label: "Analytics",
        description: "Review recommendation quality, AI usage, and feedback taste signals.",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        href: "/settings/account",
        label: "Account",
        description: "Update your password and personal account settings.",
      },
      {
        href: "/settings/connections",
        label: "Connections",
        description: "Connect the services Recommendarr uses.",
      },
      {
        href: "/settings/preferences",
        label: "Preferences",
        description: "Choose your defaults, filters, and watch-history options.",
      },
      {
        href: "/settings/history",
        label: "History sources",
        description: "Import watched titles from Plex, Tautulli, or manual entries.",
      },
      {
        href: "/health",
        label: "Health",
        description: "View service status, sync jobs, and queued work.",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/admin",
        label: "Admin",
        description: "Manage users, roles, and admin-only tools.",
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];
