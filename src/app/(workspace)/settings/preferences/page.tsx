import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";

import { PreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

export default async function PreferencesSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const preferences = await getPreferencesByUserId(session.user.id);

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          User preferences
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Preferences
          </h1>
          <p className="text-base leading-7 text-muted">
            Recommendation defaults, history filters, and watch-history-only mode
            are now stored explicitly per user instead of being left to route-local
            state.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <Panel
          eyebrow="Saved defaults"
          title="Preference controls"
          description="These values are the first normalized preference record in the new schema and can be consumed later by history and recommendation workflows."
        >
          <PreferencesForm preferences={preferences} />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Current values"
            title="Stored preference snapshot"
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default media mode:</span> {preferences.defaultMediaMode}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default result count:</span> {preferences.defaultResultCount}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Watch-history only:</span> {preferences.watchHistoryOnly ? "Enabled" : "Disabled"}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Boundary"
            title="What this route owns"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Explicit user defaults for recommendation requests.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Persisted history filter toggles.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Watch-history source behavior flags that future recommendation workflows can consume.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
