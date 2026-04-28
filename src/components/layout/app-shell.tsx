import Link from "next/link";
import { type ReactNode } from "react";

import { AppNavLink } from "@/components/layout/app-nav-link";
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
      <div className="min-h-screen overflow-x-clip px-4 py-5 sm:px-6 sm:py-7 xl:px-8 xl:py-9">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 sm:gap-6 xl:gap-8 lg:flex-row lg:items-start">
          <aside className="lg:sticky lg:top-7 lg:w-80 lg:flex-none xl:w-[21rem]">
            <div className="rounded-3xl border border-line/70 bg-panel/90 p-4 shadow-soft ring-1 ring-white/[0.03] backdrop-blur sm:p-5 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-accent sm:text-xs sm:tracking-[0.32em]">
                Personal workspace
              </p>
              <div className="mt-4 flex items-start gap-3">
                <Link
                  href="/"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 font-heading text-sm font-semibold text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
                  aria-label="Recommendarr home"
                >
                  RA
                </Link>
                <div className="min-w-0 space-y-2">
                  <Link
                    href="/"
                    className="block truncate font-heading text-2xl leading-none tracking-normal text-foreground sm:text-3xl"
                  >
                    Recommendarr Next
                  </Link>
                  <p className="text-sm leading-6 text-muted">
                    Recommendations, watch history, and library actions in one place.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 ring-1 ring-white/[0.02]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                  Signed in as
                </p>
                <p className="mt-2 font-medium text-foreground">
                  {user.name || user.email || "Recommendarr user"}
                </p>
                {user.email ? <p className="mt-1 text-sm text-muted">{user.email}</p> : null}
                <div className="mt-4">
                  <SignOutForm />
                </div>
              </div>

              <div className="mt-7 space-y-5 sm:space-y-6">
                {navigationGroups.map((group) => (
                  <section key={group.title} className="space-y-3">
                    <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted sm:text-xs sm:tracking-[0.28em]">
                      {group.title}
                    </h2>
                    <div className="space-y-2">
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
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SabnzbdQueueProvider>
  );
}

