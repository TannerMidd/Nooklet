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
      <div className="min-h-screen overflow-x-clip px-3 py-2.5 sm:px-6 sm:py-5 xl:px-7 xl:py-6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 lg:flex-row lg:items-start xl:gap-6">
          <aside className="lg:sticky lg:top-5 lg:w-56 lg:flex-none xl:w-60">
            <div className="cozy-panel rounded-lg border border-line/65 bg-panel/92 p-3 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto">
              <div className="flex items-center gap-2.5 border-b border-line/55 pb-3">
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
                    className="block truncate font-heading text-lg leading-none text-foreground"
                  >
                    Nooklet
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-muted">
                    Media taste desk
                  </p>
                </div>
              </div>

              <nav className="mt-4 space-y-4" aria-label="Workspace navigation">
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

              <div className="mt-4 border-t border-line/55 pt-3">
                <div className="rounded-md bg-background/20 px-2.5 py-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.name || user.email || "Nooklet user"}
                  </p>
                  {user.email ? <p className="mt-0.5 truncate text-[11px] text-muted">{user.email}</p> : null}
                  <div className="mt-2">
                    <SignOutForm />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SabnzbdQueueProvider>
  );
}

