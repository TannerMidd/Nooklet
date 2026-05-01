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
            <div className="cozy-panel rounded-xl border border-line/70 bg-panel p-4 sm:p-5 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
              <p className="font-heading text-sm italic text-accent-cool">
                Your nook
              </p>
              <div className="mt-4 flex items-start gap-3">
                <Link
                  href="/"
                  className="nooklet-brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent/35 font-heading text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                  aria-label="Nooklet home"
                >
                  NK
                </Link>
                <div className="min-w-0 space-y-2">
                  <Link
                    href="/"
                    className="block truncate font-heading text-2xl leading-none tracking-normal text-foreground sm:text-3xl"
                  >
                    Nooklet
                  </Link>
                  <p className="text-sm leading-6 text-muted">
                    A cozy corner for what&apos;s next — recommendations, history, and your library, all in one place.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-accent-cool/20 bg-accent-cool/10 px-4 py-4">
                <p className="font-heading text-sm italic text-accent-cool">
                  Signed in as
                </p>
                <p className="mt-2 font-medium text-foreground">
                  {user.name || user.email || "Nooklet user"}
                </p>
                {user.email ? <p className="mt-1 text-sm text-muted">{user.email}</p> : null}
                <div className="mt-4">
                  <SignOutForm />
                </div>
              </div>

              <div className="mt-7 space-y-5 sm:space-y-6">
                {navigationGroups.map((group) => (
                  <section key={group.title} className="space-y-3">
                    <h2 className="font-heading text-sm italic text-accent-cool/90">
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

