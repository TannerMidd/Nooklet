import type { getReadiness } from "@/modules/readiness/queries/get-readiness";

export type SetupCapability = "movies" | "tv" | "youtube";
export type SetupStep = {
    id: string;
    title: string;
    detail: string;
    ready: boolean | null;
    href: string;
    action: string;
};
type SetupReadiness = Awaited<ReturnType<typeof getReadiness>>;

export function parseSetupCapability(value: unknown): SetupCapability {
    return value === "tv" || value === "youtube" ? value : "movies";
}

export function setupReturnHref(value: unknown): string {
    if (typeof value !== "string") {
        return "/setup";
    }

    // Only return to the checklist, never an arbitrary URL supplied in a query.
    try {
        const url = new URL(value, "http://nooklet.local");

        if (url.origin !== "http://nooklet.local" || url.pathname !== "/setup") {
            return "/setup";
        }

        return `/setup?capability=${parseSetupCapability(url.searchParams.get("capability"))}`;
    } catch {
        return "/setup";
    }
}

export function buildSetupChecklist(
    readiness: SetupReadiness,
    capability: SetupCapability,
    youtubeToolsReady: boolean | null = null,
): SetupStep[] {
    const mediaType = capability === "movies" ? "movie" : capability;
    const returnTo = `/setup?capability=${capability}`;
    const withReturn = (href: string) =>
        `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
    const connection = (service: string) =>
        withReturn(`/settings/connections?configure=${service}`);
    const verified = (service: string) =>
        readiness.services.some(
            (item) => item.serviceType === service && item.status === "verified",
        );
    const destinationReady = readiness.storage.libraryDestinations.some(
        (item) => item.mediaType === mediaType && item.live && item.readable && item.writable,
    );
    const destination: SetupStep = {
        id: "destination",
        title: `Choose a ${capability === "movies" ? "movie" : capability === "tv" ? "TV" : "YouTube"} destination`,
        detail: "Attach a folder with a current readable, writable storage check.",
        ready: destinationReady,
        href: withReturn(`/settings/storage?mediaType=${mediaType}`),
        action: "Set up destination",
    };
    const worker: SetupStep = {
        id: "worker",
        title: "Check the background worker",
        detail: "The worker must be responsive to process downloads and refresh storage readings.",
        ready: readiness.worker.responsive && !readiness.worker.degraded,
        href: withReturn("/health"),
        action: "Check worker health",
    };

    if (capability === "youtube") {
        return [
            destination,
            worker,
            {
                id: "youtube-tools",
                title: "Check video tools and workspace",
                detail: "Verify yt-dlp, FFmpeg, the JavaScript runtime, and a writable video workspace. No metadata or Usenet account is needed.",
                ready: youtubeToolsReady,
                href:
                    youtubeToolsReady === false
                        ? withReturn("/health")
                        : `${returnTo}&checkTools=1`,
                action: youtubeToolsReady === false ? "View tool diagnostics" : "Check video tools",
            },
        ];
    }

    const workspace = readiness.storage.downloadWorkspace;

    return [
        {
            id: "metadata",
            title: "Connect metadata",
            detail: "TMDB identifies titles and supplies artwork. This connection is shared by movies and TV.",
            ready: verified("tmdb"),
            href: connection("tmdb"),
            action: "Configure TMDB",
        },
        {
            id: "downloader",
            title: "Connect a Usenet server",
            detail: "The built-in downloader uses this account for both movies and TV.",
            ready: verified("usenet-server"),
            href: connection("usenet-server"),
            action: "Configure Usenet",
        },
        {
            id: "indexer",
            title: `Verify an indexer for ${capability === "tv" ? "TV" : "movies"}`,
            detail: "Enable a verified Newznab indexer with categories for this media type.",
            ready: readiness.indexers.some(
                (item) =>
                    item.protocol === "newznab" &&
                    item.isEnabled &&
                    item.status === "verified" &&
                    item.categories.some((category) => category.mediaType === mediaType),
            ),
            href: withReturn("/settings/indexers?add=1"),
            action: "Configure indexers",
        },
        {
            id: "workspace",
            title: "Check download staging",
            detail: "Temporary processing needs its own writable workspace and enough free space.",
            ready:
                workspace.reachable &&
                workspace.writable &&
                (workspace.availableForNewDownloadsBytes ?? 0) > 0,
            href: withReturn(`/settings/storage?mediaType=${mediaType}`),
            action: "Check storage",
        },
        destination,
        worker,
    ];
}
