"use client";

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

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavLink({ item, badge }: AppNavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative block rounded-lg border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        active
          ? "border-accent/40 bg-accent/10 text-foreground"
          : "border-transparent bg-transparent text-muted hover:border-line/70 hover:bg-panel-strong/60 hover:text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-3 h-[calc(100%-1.5rem)] w-0.5 rounded-full transition",
          active ? "bg-accent" : "bg-transparent group-hover:bg-line",
        )}
      />
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center text-sm font-semibold text-current">
            <span className="block truncate">{item.label}</span>
            <NavLinkPendingIndicator />
          </span>
          <span className="mt-1 block line-clamp-1 text-xs leading-5 text-muted">
            {item.description}
          </span>
        </span>
        {badge}
      </span>
    </Link>
  );
}