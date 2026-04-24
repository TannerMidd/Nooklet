import Link from "next/link";
import { type ReactNode } from "react";

import { SignOutForm } from "@/components/layout/sign-out-form";
import { navigationGroups } from "@/config/navigation";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

export function AppShell({ children, user }: AppShellProps) {
  return (
    <div className="min-h-screen overflow-x-clip px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-8 lg:w-80 lg:flex-none">
          <div className="rounded-[32px] border border-line/80 bg-panel/95 p-5 shadow-soft backdrop-blur sm:p-6">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-accent sm:text-xs sm:tracking-[0.32em]">
              Phase 1 scaffold
            </p>
            <div className="mt-4 space-y-3">
              <Link href="/" className="block font-heading text-2xl leading-none text-foreground sm:text-3xl">
                Recommendarr Next
              </Link>
              <p className="text-sm leading-6 text-muted">
                Domain-first route surface anchored to the rewrite ADR and
                behavior matrix.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4">
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

            <div className="mt-8 space-y-5 sm:space-y-6">
              {navigationGroups.map((group) => (
                <section key={group.title} className="space-y-3">
                  <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted sm:text-xs sm:tracking-[0.28em]">
                    {group.title}
                  </h2>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 transition",
                          "hover:border-accent/40 hover:bg-panel hover:text-foreground",
                        )}
                      >
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
                      </Link>
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
  );
}

