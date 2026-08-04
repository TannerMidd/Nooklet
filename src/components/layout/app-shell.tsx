"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { AppNavLink } from "@/components/layout/app-nav-link";
import { InProgressNavBadge } from "@/components/layout/in-progress-nav-badge";
import {
  QuickActionPalette,
  QuickActionTrigger,
} from "@/components/layout/quick-action-palette";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { SabnzbdQueueProvider } from "@/components/recommendations/sabnzbd-queue-provider";
import { Drawer } from "@/components/ui/drawer";
import { navigationGroups, type NavigationGroup } from "@/config/navigation";

type AppShellProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role?: "admin" | "user";
  };
};

function userInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "Nooklet user").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "N";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : source[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

function NavigationContents({
  groups,
  user,
  onNavigate,
}: {
  groups: readonly NavigationGroup[];
  user: AppShellProps["user"];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        className="min-h-0 flex-1 space-y-[22px] overflow-y-auto px-3 pb-4 pt-1"
        aria-label="Workspace navigation"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            onNavigate?.();
          }
        }}
      >
        {groups.map((group, groupIndex) => (
          <section key={group.title} aria-label={group.title} className="space-y-0.5">
            {/* The redesign leaves the first group unlabeled and captions every
                group after it with uppercase micro-type. */}
            {groupIndex > 0 ? (
              <h2 className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.10em] text-muted/70">
                {group.title}
              </h2>
            ) : null}
            {group.items.map((item) => (
              <AppNavLink
                key={item.href}
                item={item}
                badge={item.href === "/in-progress" ? <InProgressNavBadge /> : null}
              />
            ))}
          </section>
        ))}
      </nav>

      <div className="m-3 flex items-center gap-2.5 rounded-lg border border-cream/[0.07] bg-cream/[0.03] px-3 py-2.5">
        <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent/[0.14] text-xs font-bold text-accent">
          {userInitials(user.name, user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {user.name || user.email || "Nooklet user"}
          </p>
          {user.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
        </div>
        <SignOutForm />
      </div>
    </div>
  );
}

export function AppShell({ children, user }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeMobileNav = () => setMobileNavOpen(false);
  const visibleNavigationGroups = useMemo(
    () => navigationGroups
      .map((group) => ({
        ...group,
        items: group.items,
      }))
      .filter((group) => group.items.length > 0),
    [],
  );

  return (
    <SabnzbdQueueProvider>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[70] -translate-y-24 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-background transition focus:translate-y-0"
      >
        Skip to content
      </a>
      <QuickActionPalette />

      <div className="min-h-screen lg:pl-56">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-cream/[0.07] bg-background/95 px-4 backdrop-blur lg:hidden">
          <Link
            href="/home"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Nooklet home"
          >
            <span aria-hidden="true" className="nk-brand-dot h-2.5 w-2.5 shrink-0" />
            <span className="nooklet-wordmark text-[20px] leading-none text-foreground">Nooklet</span>
          </Link>
          <div className="flex items-center gap-2">
            <QuickActionTrigger compact />
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-cream/[0.14] bg-cream/[0.04] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <aside
          aria-label="Workspace navigation panel"
          className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-cream/[0.07] bg-panel/60 lg:flex"
        >
          <div className="flex items-center px-5 pb-4 pt-5">
            <Link
              href="/home"
              className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label="Nooklet home"
            >
              <span aria-hidden="true" className="nk-brand-dot h-[9px] w-[9px] shrink-0" />
              <span className="nooklet-wordmark text-[21px] leading-none text-foreground">Nooklet</span>
            </Link>
          </div>
          <div className="px-3 pb-1">
            <QuickActionTrigger />
          </div>
          <NavigationContents groups={visibleNavigationGroups} user={user} />
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 px-4 pb-12 pt-6 sm:px-6 lg:px-12 lg:pb-16 lg:pt-9">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>

      <Drawer
        id="workspace-navigation"
        open={mobileNavOpen}
        onClose={closeMobileNav}
        title="Nooklet"
        side="left"
      >
        <NavigationContents
          groups={visibleNavigationGroups}
          user={user}
          onNavigate={closeMobileNav}
        />
      </Drawer>
    </SabnzbdQueueProvider>
  );
}
