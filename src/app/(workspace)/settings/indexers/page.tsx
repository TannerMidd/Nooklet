import { auth } from "@/auth";
import { IndexerSettingsForm } from "@/app/(workspace)/settings/indexers/indexer-settings-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
    listIndexerSettings,
    type IndexerSettingsView,
} from "@/modules/indexers/queries/list-indexer-settings";

export const dynamic = "force-dynamic";

function ConfiguredIndexers({
    indexers,
    canManage,
}: {
    indexers: IndexerSettingsView[];
    canManage: boolean;
}) {
    if (indexers.length === 0) {
        return <EmptyState message="No indexers configured yet." />;
    }

    return (
        <ul className="space-y-4">
            {indexers.map((indexer) => (
                <li
                    key={indexer.id}
                    className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] p-4"
                >
                    {canManage ? (
                        <IndexerSettingsForm indexer={indexer} />
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-foreground">{indexer.name}</p>
                                    <p className="mt-1 text-sm text-muted">{indexer.baseUrl}</p>
                                </div>
                                <span className="rounded-full border border-cream/[0.08] bg-cream/[0.04] px-3 py-1 text-xs font-semibold capitalize text-muted">
                                    {indexer.status}
                                </span>
                            </div>
                            <p className="text-xs leading-5 text-muted">
                                {indexer.categories.length > 0
                                    ? `Searches ${Array.from(new Set(indexer.categories.map((category) => (category.mediaType === "tv" ? "TV" : "movies")))).join(" and ")}.`
                                    : "No movie or TV categories are configured."}
                                {indexer.statusMessage ? ` ${indexer.statusMessage}` : ""}
                            </p>
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

export default async function IndexerSettingsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const indexers = await listIndexerSettings(session.user.id);

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Built-in search"
                title="Indexers"
                description="Connect Newznab providers that Nooklet can search for movie and TV releases."
            />

            <div className="rounded-xl border border-cream/[0.08] bg-cream/[0.03] px-4 py-3 text-sm leading-6 text-muted">
                Enabled indexers are searched by their order number, lowest first. Providers with
                the same number are searched together. A failed provider does not prevent Nooklet
                from trying the next one.
            </div>

            {session.user.role === "admin" ? (
                <details className="rounded-2xl border border-cream/[0.08] bg-cream/[0.03]">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold text-foreground">
                        <span>
                            Add an indexer
                            <span className="mt-0.5 block text-xs font-normal text-muted">
                                Choose a provider preset, enter its API key, then test the
                                connection.
                            </span>
                        </span>
                        <span aria-hidden="true" className="text-xl text-muted">
                            +
                        </span>
                    </summary>
                    <div className="border-t border-cream/[0.07] p-5">
                        <IndexerSettingsForm />
                    </div>
                </details>
            ) : (
                <p className="rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-3 text-sm leading-6 text-foreground">
                    These indexers are shared by the administrator and are available to your
                    searches and requests. Only an administrator can change them.
                </p>
            )}

            <Panel eyebrow="Configured" title="Search providers">
                <ConfiguredIndexers indexers={indexers} canManage={session.user.role === "admin"} />
            </Panel>
        </div>
    );
}
