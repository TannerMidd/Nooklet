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
        href: "/history",
        label: "History",
        description: "Review past recommendations, feedback, and library actions.",
      },
      {
        href: "/in-progress",
        label: "In progress",
        description: "Track active downloader work without stretching recommendation pages.",
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
