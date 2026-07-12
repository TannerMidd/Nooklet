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
  Search,
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
  "/search": Search,
  "/library": Library,
  "/history": History,
  "/in-progress": Download,
  "/analytics": BarChart3,
  "/settings/account": User,
  "/settings/connections": Plug,
  "/settings/indexers": Search,
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
        "group relative flex h-[38px] items-center gap-[11px] rounded-md px-3 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        active
          ? "bg-cream/[0.06] text-foreground"
          : "text-muted hover:bg-cream/[0.05] hover:text-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "h-[17px] w-[17px] shrink-0 transition",
          active ? "text-accent" : "text-muted/90 group-hover:text-foreground",
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
