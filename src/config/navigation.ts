export type NavigationItem = {
  href: string;
  label: string;
  description: string;
  /** Routes represented by this destination even when their legacy URLs remain. */
  activePrefixes?: readonly string[];
};

export type NavigationGroup = {
  title: string;
  items: readonly NavigationItem[];
};

export const publicEntryPoints = [
  {
    href: "/login",
    label: "Local login",
    description: "Sign in with your Nooklet account.",
  },
  {
    href: "/bootstrap",
    label: "First-admin bootstrap",
    description: "Set up the first administrator for a new install.",
  },
] as const satisfies readonly NavigationItem[];

export const navigationGroups = [
  {
    title: "Workspace",
    items: [
      {
        href: "/home",
        label: "Home",
        description: "See readiness, active work, and the best next action.",
      },
      {
        href: "/discover",
        label: "Discover",
        description: "Find, search, and get personalized movie and TV ideas.",
        activePrefixes: ["/tv", "/movies", "/search", "/history", "/analytics"],
      },
      {
        href: "/library",
        label: "Library",
        description: "Browse and manage movies and series already in Nooklet.",
      },
      {
        href: "/in-progress",
        label: "Activity",
        description: "Track downloads, resolve problems, and review completed work.",
      },
      {
        href: "/settings",
        label: "Settings",
        description: "Manage your account and role-appropriate Nooklet configuration.",
        activePrefixes: ["/health", "/admin"],
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];
