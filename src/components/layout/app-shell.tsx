import Link from "next/link";
import { type ReactNode } from "react";

import { AppNavLink } from "@/components/layout/app-nav-link";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { InProgressNavBadge } from "@/components/layout/in-progress-nav-badge";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { SabnzbdQueueProvider } from "@/components/recommendations/sabnzbd-queue-provider";
import { navigationGroups } from "@/config/navigation";

type AppShellProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

export function AppShell({ children, user }: AppShellProps) {
  return (
    <SabnzbdQueueProvider>
      <div className="min-h-screen lg:pl-60">
        <aside className="flex flex-col border-b border-line/45 bg-panel/70 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2.5 border-b border-line/40 px-4 py-3.5">
            <Link
              href="/"
              className="nooklet-brand-mark relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/35 font-heading text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
              aria-label="Nooklet home"
            >
              <LinkPendingOverlay />
              NK
            </Link>
            <div className="min-w-0">
              <Link
                href="/"
                className="nooklet-wordmark block truncate text-lg leading-none text-foreground"
              >
                Nooklet
              </Link>
              <p className="mt-0.5 truncate text-[11px] font-medium text-muted">
                Media taste desk
              </p>
            </div>
          </div>

          <nav
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 py-4"
            aria-label="Workspace navigation"
          >
            {navigationGroups.map((group) => (
              <section key={group.title} className="space-y-1.5">
                <h2 className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-cool/75">
                  {group.title}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <AppNavLink
                      key={item.href}
                      item={item}
                      badge={item.href === "/in-progress" ? <InProgressNavBadge /> : null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </nav>

          <div className="border-t border-line/40 px-4 py-3">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name || user.email || "Nooklet user"}
            </p>
            {user.email ? <p className="mt-0.5 truncate text-[11px] text-muted">{user.email}</p> : null}
            <div className="mt-2">
              <SignOutForm />
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </SabnzbdQueueProvider>
  );
}
