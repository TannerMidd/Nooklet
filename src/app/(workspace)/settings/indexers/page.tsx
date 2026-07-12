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

function ConfiguredIndexers({ indexers }: { indexers: IndexerSettingsView[] }) {
  if (indexers.length === 0) {
    return <EmptyState message="No indexers configured yet." />;
  }

  return (
    <ul className="space-y-4">
      {indexers.map((indexer) => (
        <li key={indexer.id} className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] p-4">
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
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Built-in search"
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
