"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Compass,
  Download,
  Film,
  History,
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
        "group relative flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        active
          ? "nooklet-nav-link--active text-foreground"
          : "text-muted hover:bg-panel-strong/40 hover:text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "nooklet-nav-link__rail absolute left-0 top-1.5 h-[calc(100%-0.75rem)] w-0.5 rounded-full transition",
          active ? "" : "bg-transparent group-hover:bg-accent/55",
        )}
      />
      <Icon
        aria-hidden="true"
        className={cn(
          "h-4 w-4 shrink-0 transition",
          active ? "text-accent-strong" : "text-muted/80 group-hover:text-foreground",
        )}
      />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center text-sm font-medium text-current">
          <span className="block truncate">{item.label}</span>
          <NavLinkPendingIndicator />
        </span>
        {badge}
      </span>
    </Link>
  );
}