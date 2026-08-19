import Link from "next/link";

import { LibraryDrivesPanel } from "@/app/(workspace)/library/library-drives-panel";
import { LibraryPathForm } from "@/app/(workspace)/library/library-path-form";
import { LibraryPathManager } from "@/app/(workspace)/library/library-path-manager";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StorageOverviewView } from "@/components/storage/storage-overview";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { LibraryMediaType } from "@/lib/database/schema";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { getStorageOverview } from "@/modules/storage/queries/get-storage-overview";

export const dynamic = "force-dynamic";

type LibraryOverview = Awaited<ReturnType<typeof listLibraryOverview>>;

function LibraryFolderManager({ overview }: { overview: LibraryOverview }) {
    if (overview.libraries.length === 0) {
        return <EmptyState message="No library folders are attached yet." />;
    }

    return (
        <ul className="space-y-4">
            {overview.libraries.map((library) => (
                <li
                    key={library.id}
                    className="rounded-xl border border-cream/[0.08] bg-cream/[0.03] p-4"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{library.name}</h3>
                        <Badge variant={library.mediaType === "tv" ? "accent-cool" : "accent"}>
                            {library.mediaType === "tv"
                                ? "TV"
                                : library.mediaType === "youtube"
                                  ? "YouTube"
                                  : "Movies"}
                        </Badge>
                        <span className="text-xs text-muted">
                            {library.pathCount} {library.pathCount === 1 ? "folder" : "folders"}
                        </span>
                    </div>
                    <ul className="mt-3">
                        {library.paths.map((libraryPath) => (
                            <LibraryPathManager
                                key={libraryPath.id}
                                library={library}
                                path={libraryPath}
                            />
                        ))}
                    </ul>
                </li>
            ))}
        </ul>
    );
}

function requestedMediaType(value: string | string[] | undefined): LibraryMediaType {
    const candidate = Array.isArray(value) ? value[0] : value;

    return candidate === "tv" || candidate === "youtube" ? candidate : "movie";
}

export default async function StorageSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ mediaType?: string | string[] }>;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const [{ mediaType }, overview, libraryOverview] = await Promise.all([
        searchParams,
        getStorageOverview(session.user.id),
        session.user.role === "admin" ? listLibraryOverview(session.user.id) : null,
    ]);

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Instance storage"
                title="Storage"
                description="See the exact filesystem Nooklet checks before a download and the separate destinations used after import."
                actions={
                    <Link
                        href="/setup"
                        className="relative inline-flex min-h-11 items-center rounded-lg border border-cream/[0.12] bg-cream/[0.04] px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        <LinkPendingOverlay />
                        Setup Center
                    </Link>
                }
            />

            <Panel
                title="Storage preflight"
                description="Live reachability, write access, capacity, reservations, and runtime path mapping."
            >
                <StorageOverviewView overview={overview} />
            </Panel>

            {session.user.role === "admin" ? (
                <>
                    <Panel
                        title="Default import destinations"
                        description="Choose fallback movie, TV, and YouTube folders used when a request does not specify one."
                    >
                        <LibraryDrivesPanel entries={overview.libraryDestinations} />
                    </Panel>

                    <Panel
                        title="Attach a final library folder"
                        description="The folder must exist inside an approved media root and be writable by the Nooklet process."
                    >
                        <LibraryPathForm defaultMediaType={requestedMediaType(mediaType)} />
                    </Panel>

                    <Panel
                        title="Manage attached folders"
                        description="Rename, retarget, disable, or remove final media destinations. Removing a folder does not delete its files."
                    >
                        <LibraryFolderManager overview={libraryOverview!} />
                    </Panel>

                    <Panel
                        title="Server-managed staging"
                        description="The download workspace is configured with DOWNLOAD_ENGINE_DIR because its Docker volume binding must exist before Nooklet starts."
                    >
                        <Link
                            href="/health"
                            className="relative inline-flex min-h-11 items-center rounded-lg border border-cream/[0.12] bg-cream/[0.04] px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        >
                            <LinkPendingOverlay />
                            Open system health
                        </Link>
                    </Panel>
                </>
            ) : (
                <p className="rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm leading-6 text-foreground">
                    This storage configuration is shared from the administrator account. Ask an
                    administrator to change paths or Docker volume bindings.
                </p>
            )}
        </div>
    );
}
