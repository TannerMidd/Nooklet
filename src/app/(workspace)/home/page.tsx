import type { Metadata } from "next";
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Compass,
    Film,
    Library,
    Search,
    Sparkles,
    Tv,
} from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { getActiveDownloadQueue } from "@/modules/download-engine/queries/get-active-download-queue";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { listDownloadActivity } from "@/modules/downloads/queries/list-download-activity";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { getReadiness } from "@/modules/readiness/queries/get-readiness";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Home",
};

const primaryActions = [
    {
        href: "/search",
        label: "Find a title",
        description: "Search movies and TV, then review one clear request.",
        icon: Search,
    },
    {
        href: "/discover",
        label: "Browse Discover",
        description: "Explore personalized, trending, and upcoming titles.",
        icon: Compass,
    },
    {
        href: "/movies",
        label: "Movie ideas",
        description: "Generate recommendations shaped by your taste.",
        icon: Film,
    },
    {
        href: "/tv",
        label: "TV ideas",
        description: "Find a series that fits the mood you describe.",
        icon: Tv,
    },
] as const;

function friendlyFailure(message: string | null) {
    const normalized = message?.toLowerCase() ?? "";

    if (normalized.includes("disk space") || normalized.includes("not enough free")) {
        return "The download workspace needs more free space.";
    }

    if (normalized.includes("destination") || normalized.includes("library folder")) {
        return "Choose or repair the destination library folder.";
    }

    if (normalized.includes("no media files")) {
        return "The downloaded release did not contain importable media.";
    }

    if (normalized.includes("queue")) {
        return "The downloader no longer has the queued item.";
    }

    return "This download needs a recovery action.";
}

export default async function WorkspaceHomePage() {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const [library, activity, queue, readiness] = await Promise.all([
        listLibraryOverview(session.user.id),
        listDownloadActivity(session.user.id),
        getActiveDownloadQueue(session.user.id),
        getReadiness(session.user.id),
    ]);
    const needsAttention = activity.filter(
        (entry) => entry.status === "failed" || entry.status === "cancelled",
    );
    const completed = activity.filter((entry) => entry.status === "succeeded");
    const activeCount = queue.snapshot?.activeQueueCount ?? 0;
    const firstName = session.user.name?.trim().split(/\s+/)[0];
    const setupAttention = readiness.evaluation.capabilities.filter(
        (entry) => entry.status === "needs-attention",
    );
    const capabilityHighlights = readiness.evaluation.capabilities.filter((entry) =>
        ["discover", "recommendations", "movie-downloads", "tv-downloads"].includes(entry.id),
    );

    return (
        <div className="nk-enter space-y-8">
            <PageHeader
                eyebrow="Your Nooklet"
                title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                description="Find something worth watching, see what Nooklet is doing, and fix anything that needs attention."
            />

            {!readiness.evaluation.setupComplete ? (
                <section className="rounded-2xl border border-accent/35 bg-accent/10 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
                    <div>
                        <p className="flex items-center gap-2 font-semibold text-foreground">
                            <Sparkles aria-hidden="true" className="h-5 w-5 text-accent" />
                            Finish setting up Nooklet
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted">
                            {readiness.evaluation.completedCoreChecks} of{" "}
                            {readiness.evaluation.totalCoreChecks} first-request checks are ready.
                            {setupAttention.length > 0
                                ? ` Next: ${setupAttention
                                      .slice(0, 2)
                                      .map((entry) => entry.title)
                                      .join(" and ")}.`
                                : ""}
                        </p>
                        <div
                            className="mt-3 h-2 max-w-xl overflow-hidden rounded-full bg-black/20"
                            role="progressbar"
                            aria-label="Setup progress"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={readiness.evaluation.progressPercent}
                        >
                            <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${readiness.evaluation.progressPercent}%` }}
                            />
                        </div>
                    </div>
                    <Link
                        href="/setup"
                        className="nk-button-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:mt-0"
                    >
                        Open setup <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                </section>
            ) : null}

            <section aria-labelledby="home-actions-title">
                <h2 id="home-actions-title" className="sr-only">
                    Start something
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {primaryActions.map((action) => {
                        const Icon = action.icon;

                        return (
                            <Link
                                key={action.href}
                                href={action.href}
                                className="group rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5 transition hover:-translate-y-0.5 hover:border-cream/[0.16] hover:bg-cream/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                    <Icon aria-hidden="true" className="h-5 w-5" />
                                </span>
                                <span className="mt-4 block font-heading text-[21px] text-foreground">
                                    {action.label}
                                </span>
                                <span className="mt-1 block text-sm leading-5 text-muted">
                                    {action.description}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Active downloads" value={activeCount} />
                <StatCard label="Needs attention" value={needsAttention.length} />
                <StatCard label="Library titles" value={library.totals.titles} />
                <StatCard label="Media files" value={library.totals.files} />
            </div>

            <Panel
                title="What is ready"
                description="Capability status reflects the complete path—not just whether one service is connected."
                actions={
                    <Link
                        href="/setup"
                        className="text-sm font-semibold text-accent hover:text-accent-strong"
                    >
                        View setup details
                    </Link>
                }
            >
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {capabilityHighlights.map((capability) => (
                        <li
                            key={capability.id}
                            className="rounded-xl border border-cream/[0.08] bg-cream/[0.03] p-3.5"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                    {capability.title}
                                </p>
                                <Badge
                                    variant={
                                        capability.status === "ready"
                                            ? "accent-cool"
                                            : capability.status === "needs-attention"
                                              ? "wine"
                                              : "neutral"
                                    }
                                >
                                    {capability.status === "ready"
                                        ? "Ready"
                                        : capability.status === "needs-attention"
                                          ? "Attention"
                                          : "Optional"}
                                </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted">
                                {capability.summary}
                            </p>
                        </li>
                    ))}
                </ul>
                {readiness.evaluation.setupComplete ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-accent-cool">
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        At least one complete request path is ready.
                    </p>
                ) : null}
            </Panel>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel
                    eyebrow="Action center"
                    title="Needs attention"
                    description="Problems are summarized in plain language; Activity has the exact recovery action."
                    actions={
                        <Link
                            href="/in-progress?view=attention"
                            className="text-sm font-semibold text-accent hover:text-accent-strong"
                        >
                            Open Activity
                        </Link>
                    }
                >
                    {needsAttention.length === 0 ? (
                        <p className="rounded-xl border border-accent-cool/20 bg-accent-cool/10 px-4 py-3 text-sm text-foreground">
                            Nothing needs attention right now.
                        </p>
                    ) : (
                        <ul className="divide-y divide-cream/[0.05]">
                            {needsAttention.slice(0, 4).map((entry) => (
                                <li key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                                    <AlertCircle
                                        aria-hidden="true"
                                        className="mt-0.5 h-5 w-5 shrink-0 text-accent-wine"
                                    />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {entry.requestedTitle}
                                        </p>
                                        <p className="mt-0.5 text-sm leading-5 text-muted">
                                            {friendlyFailure(entry.statusMessage)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel
                    eyebrow="Library"
                    title="Recently completed"
                    description="The latest titles Nooklet successfully brought into your library."
                    actions={
                        <Link
                            href="/library"
                            className="text-sm font-semibold text-accent hover:text-accent-strong"
                        >
                            Open Library
                        </Link>
                    }
                >
                    {completed.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-cream/15 px-4 py-5 text-sm text-muted">
                            Completed imports will appear here.
                        </div>
                    ) : (
                        <ul className="divide-y divide-cream/[0.05]">
                            {completed.slice(0, 5).map((entry) => (
                                <li
                                    key={entry.id}
                                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                                >
                                    <Library
                                        aria-hidden="true"
                                        className="h-5 w-5 shrink-0 text-accent-cool"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {entry.requestedTitle}
                                        </p>
                                        <p className="text-xs capitalize text-muted">
                                            {entry.mediaType === "tv" ? "TV" : "Movie"} · Available
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
