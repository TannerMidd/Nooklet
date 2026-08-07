import Link from "next/link";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getReadiness } from "@/modules/readiness/queries/get-readiness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const personalSettings = [
    ["Account", "Password and account security.", "/settings/account"],
    ["Preferences", "Content, language, and recommendation defaults.", "/settings/preferences"],
    ["History sources", "Personal watch history and sync identity.", "/settings/history"],
    ["Notifications", "Personal alerts and delivery channels.", "/settings/notifications"],
] as const;

const instanceSettings = [
    ["Connections", "Metadata, AI, downloader, and media services.", "/settings/connections"],
    ["Indexers", "Usenet release search providers and categories.", "/settings/indexers"],
    ["Storage", "Download staging and final library destinations.", "/settings/storage"],
    ["Automation", "Schedules, next runs, outcomes, and run-now controls.", "/settings/automation"],
    ["Health", "Worker, jobs, services, and diagnostics.", "/health"],
] as const;

function SettingsCards({ entries }: { entries: readonly (readonly [string, string, string])[] }) {
    return (
        <ul className="grid gap-3 sm:grid-cols-2">
            {entries.map(([title, description, href]) => (
                <li key={href}>
                    <Link
                        href={href}
                        className="relative block min-h-full rounded-xl border border-cream/[0.08] bg-cream/[0.03] p-4 transition hover:-translate-y-0.5 hover:border-accent/30 hover:bg-cream/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        <LinkPendingOverlay />
                        <h3 className="font-semibold text-foreground">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export default async function SettingsOverviewPage() {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const { evaluation } = await getReadiness(session.user.id);
    const attentionCount = evaluation.capabilities.filter(
        (entry) => entry.status === "needs-attention",
    ).length;

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Configuration"
                title="Settings"
                description="Personal choices stay with your account. Server connections, indexers, and storage are shared across the Nooklet instance."
                actions={
                    <Link
                        href="/setup"
                        className="relative inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        <LinkPendingOverlay />
                        Open Setup Center
                    </Link>
                }
            />

            <Panel title="Readiness at a glance">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="font-semibold text-foreground">
                            {evaluation.setupComplete
                                ? "Core setup is ready"
                                : `${attentionCount} ${attentionCount === 1 ? "area needs" : "areas need"} attention`}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                            {evaluation.progressPercent}% of the first-request path is configured.
                        </p>
                    </div>
                    <Badge variant={evaluation.setupComplete ? "accent-cool" : "wine"}>
                        {evaluation.setupComplete ? "Ready" : "Setup incomplete"}
                    </Badge>
                </div>
            </Panel>

            <Panel title="Your settings" description="These choices are private to your account.">
                <SettingsCards entries={personalSettings} />
            </Panel>

            <Panel
                title="Instance settings"
                description={
                    session.user.role === "admin"
                        ? "These settings power every account on this Nooklet server."
                        : "These settings are supplied by an administrator and are available to your requests."
                }
            >
                <SettingsCards
                    entries={
                        session.user.role === "admin"
                            ? [
                                  ...instanceSettings,
                                  [
                                      "Users",
                                      "Create accounts, change roles, reset passwords, and disable access.",
                                      "/admin",
                                  ] as const,
                              ]
                            : instanceSettings
                    }
                />
            </Panel>
        </div>
    );
}
