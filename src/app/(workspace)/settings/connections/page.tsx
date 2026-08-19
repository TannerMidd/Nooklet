import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

import { ConnectionCard } from "./connection-card";
import { YouTubeAccessCard } from "./youtube-access-card";

export const dynamic = "force-dynamic";

const connectionGroups = [
    {
        title: "Browse and identify titles",
        description:
            "TMDB powers discovery and artwork. TVDB can add another source of episode and series metadata.",
        connections: [
            { serviceType: "tmdb", requirement: "Required for browsing" },
            { serviceType: "tvdb", requirement: "Optional TV metadata" },
        ],
    },
    {
        title: "Download releases",
        description: "Nooklet's built-in downloader needs a Usenet server.",
        connections: [{ serviceType: "usenet-server", requirement: "Required for downloads" }],
    },
    {
        title: "Download public videos",
        description:
            "Use a dedicated YouTube session only when YouTube blocks this server's guest traffic.",
        connections: [
            { serviceType: "youtube", requirement: "Required when guest access is challenged" },
        ],
    },
    {
        title: "Personalize recommendations",
        description:
            "AI recommendations are optional. Nooklet's library and manual search continue to work without them.",
        connections: [{ serviceType: "ai-provider", requirement: "Required for AI picks" }],
    },
    {
        title: "Import watch history",
        description: "Choose the source you already use. You do not need to connect all three.",
        connections: [
            { serviceType: "plex", requirement: "Optional history source" },
            { serviceType: "tautulli", requirement: "Optional history source" },
            { serviceType: "trakt", requirement: "Personal history source" },
        ],
    },
] as const;

export default async function ConnectionsSettingsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const summaries = await listConnectionSummaries(session.user.id);

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Services"
                title="Connections"
                description="Connect only the services needed for the Nooklet features you want to use."
            />

            {session.user.role !== "admin" ? (
                <p className="rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm leading-6 text-foreground">
                    Instance services are shared by the administrator and power requests for every
                    user. You can connect your own Trakt account for personal watch history.
                </p>
            ) : null}

            {connectionGroups.map((group) => {
                const cards = group.connections.flatMap((connection) => {
                    const summary = summaries.find(
                        (item) => item.serviceType === connection.serviceType,
                    );

                    return summary ? [{ summary, requirement: connection.requirement }] : [];
                });

                return (
                    <section
                        key={group.title}
                        aria-labelledby={`connection-group-${group.connections[0].serviceType}`}
                        className="space-y-3"
                    >
                        <div className="max-w-3xl">
                            <h2
                                id={`connection-group-${group.connections[0].serviceType}`}
                                className="font-heading text-2xl text-foreground"
                            >
                                {group.title}
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-muted">{group.description}</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                            {cards.map(({ summary, requirement }) =>
                                summary.serviceType === "youtube" ? (
                                    <YouTubeAccessCard
                                        key={summary.serviceType}
                                        summary={summary}
                                        canManage={session.user.role === "admin"}
                                    />
                                ) : (
                                    <ConnectionCard
                                        key={summary.serviceType}
                                        summary={summary}
                                        canManage={
                                            session.user.role === "admin" ||
                                            summary.serviceType === "trakt"
                                        }
                                        requirement={requirement}
                                    />
                                ),
                            )}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
