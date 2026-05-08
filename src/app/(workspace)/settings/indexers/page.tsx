import { auth } from "@/auth";
import { IndexerSettingsForm } from "@/app/(workspace)/settings/indexers/indexer-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  listIndexerSettings,
  type IndexerSettingsView,
} from "@/modules/indexers/queries/list-indexer-settings";

export const dynamic = "force-dynamic";

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
          <IndexerSettingsForm indexer={indexer} />
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
