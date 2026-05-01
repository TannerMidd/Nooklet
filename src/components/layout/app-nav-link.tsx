"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Compass,
  Download,
  Film,
  History,
  Library,
  Plug,
  Shield,
  SlidersHorizontal,
  Tv,
  User,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { type NavigationItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

function NavLinkPendingIndicator() {
  const { pending } = useLinkStatus();

  if (!pending) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="ml-2 inline-block h-3 w-3 flex-none animate-spin rounded-full border-2 border-accent border-t-transparent"
    />
  );
}

type AppNavLinkProps = {
  item: NavigationItem;
  badge?: ReactNode;
};

const navigationIcons: Record<string, LucideIcon> = {
  "/tv": Tv,
  "/movies": Film,
  "/discover": Compass,
  "/sonarr": Library,
  "/radarr": Film,
  "/history": History,
  "/in-progress": Download,
  "/analytics": BarChart3,
  "/settings/account": User,
  "/settings/connections": Plug,
  "/settings/preferences": SlidersHorizontal,
  "/settings/history": History,
  "/settings/notifications": Bell,
  "/health": Activity,
  "/admin": Shield,
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavLink({ item, badge }: AppNavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = navigationIcons[item.href] ?? Compass;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        active
          ? "nooklet-nav-link--active border-accent/45 text-foreground"
          : "border-transparent bg-transparent text-muted hover:border-line/55 hover:bg-panel-strong/35 hover:text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "nooklet-nav-link__rail absolute left-0 top-2.5 h-[calc(100%-1.25rem)] w-0.5 rounded-full transition",
          active ? "" : "bg-transparent group-hover:bg-accent/65",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
          active
            ? "border-accent/35 bg-accent/14 text-accent-strong"
            : "border-line/45 bg-background/15 text-muted group-hover:border-line/65 group-hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center text-sm font-semibold text-current">
          <span className="block truncate">{item.label}</span>
          <NavLinkPendingIndicator />
        </span>
        {badge}
      </span>
    </Link>
  );
}