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

function userInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "Nooklet user").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "N";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : source[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

export function AppShell({ children, user }: AppShellProps) {
  return (
    <SabnzbdQueueProvider>
      <div className="min-h-screen lg:pl-56">
        <aside className="flex flex-col border-b border-cream/[0.07] bg-panel/60 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-56 lg:border-b-0 lg:border-r">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-5 pb-4 pt-5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            aria-label="Nooklet home"
          >
            <span aria-hidden="true" className="nk-brand-dot h-2.5 w-2.5 shrink-0" />
            <span className="nooklet-wordmark text-[21px] leading-none text-foreground">
              Nooklet
            </span>
          </Link>

          <nav
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1"
            aria-label="Workspace navigation"
          >
            {navigationGroups.map((group, groupIndex) => (
              <section key={group.title} className="space-y-0.5">
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
            <span
              aria-hidden="true"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent/[0.14] text-xs font-bold text-accent"
            >
              {userInitials(user.name, user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {user.name || user.email || "Nooklet user"}
              </p>
              {user.email ? (
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              ) : null}
            </div>
            <SignOutForm />
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-12 lg:py-9">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </SabnzbdQueueProvider>
  );
}
