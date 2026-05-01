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
      <div className="min-h-screen overflow-x-clip px-4 py-4 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 lg:flex-row lg:items-start xl:gap-7">
          <aside className="lg:sticky lg:top-6 lg:w-72 lg:flex-none xl:w-[19rem]">
            <div className="cozy-panel rounded-lg border border-line/65 bg-panel/92 p-3.5 sm:p-4 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
              <div className="flex items-center gap-3 border-b border-line/55 pb-4">
                <Link
                  href="/"
                  className="nooklet-brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/35 font-heading text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                  aria-label="Nooklet home"
                >
                  NK
                </Link>
                <div className="min-w-0">
                  <Link
                    href="/"
                    className="block truncate font-heading text-2xl leading-none text-foreground"
                  >
                    Nooklet
                  </Link>
                  <p className="mt-1 truncate text-xs font-medium text-muted">
                    Media taste desk
                  </p>
                </div>
              </div>

              <nav className="mt-5 space-y-5" aria-label="Workspace navigation">
                {navigationGroups.map((group) => (
                  <section key={group.title} className="space-y-3">
                    <h2 className="px-2 font-heading text-xs italic text-accent-cool/85">
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
              </nav>

              <div className="mt-5 border-t border-line/55 pt-4">
                <div className="rounded-lg border border-line/55 bg-background/18 px-3 py-3">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.name || user.email || "Nooklet user"}
                  </p>
                  {user.email ? <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p> : null}
                  <div className="mt-3">
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

