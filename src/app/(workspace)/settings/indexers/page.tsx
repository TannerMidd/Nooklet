import { auth } from "@/auth";
import { IndexerSettingsForm } from "@/app/(workspace)/settings/indexers/indexer-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  listIndexerSettings,
  type IndexerSettingsView,
} from "@/modules/indexers/queries/list-indexer-settings";

export const dynamic = "force-dynamic";

function protocolLabel(protocol: IndexerSettingsView["protocol"]) {
  return protocol === "torznab" ? "Torznab" : "Newznab";
}

function mediaTypeLabel(mediaType: IndexerSettingsView["categories"][number]["mediaType"]) {
  return mediaType === "tv" ? "TV" : "Movies";
}

function ConfiguredIndexers({ indexers }: { indexers: IndexerSettingsView[] }) {
  if (indexers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-4 text-sm text-muted">
        No indexers configured yet.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {indexers.map((indexer) => (
        <li key={indexer.id} className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="font-heading text-lg leading-tight text-foreground">{indexer.name}</p>
              <p className="break-all text-sm text-muted">
                {protocolLabel(indexer.protocol)} / {indexer.baseUrl}{indexer.apiPath}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted sm:justify-end">
              <span className="rounded-lg border border-line/70 bg-background/25 px-3 py-1 capitalize">
                {indexer.status}
              </span>
              <span className="rounded-lg border border-line/70 bg-background/25 px-3 py-1">
                {indexer.isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(160px,0.35fr)]">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Categories</p>
              {indexer.categories.length === 0 ? (
                <p className="text-muted">None</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {indexer.categories.map((category) => (
                    <span
                      key={`${category.mediaType}-${category.categoryId}`}
                      className="rounded-lg border border-line/60 bg-background/20 px-2 py-1 text-xs text-muted"
                    >
                      {mediaTypeLabel(category.mediaType)} {category.categoryId}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">API key</p>
              <p className="font-mono text-xs text-muted">{indexer.maskedApiKey ?? "Not stored"}</p>
            </div>
          </div>
          {indexer.statusMessage ? <p className="mt-3 text-sm text-muted">{indexer.statusMessage}</p> : null}
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Indexers"
        description="Configure direct Newznab and Torznab indexers for built-in search."
      />

      <Panel eyebrow="Indexer" title="Add an indexer">
        <IndexerSettingsForm />
      </Panel>

      <Panel eyebrow="Configured" title="Direct indexers">
        <ConfiguredIndexers indexers={indexers} />
      </Panel>
    </div>
  );
}
