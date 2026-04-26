import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { submitSonarrEpisodeSelectionBySeriesAction } from "@/app/(workspace)/sonarr-episode-selection-actions";
import { RecommendationEpisodePicker } from "@/components/recommendations/recommendation-episode-picker";
import { Panel } from "@/components/ui/panel";
import { decryptSecret } from "@/lib/security/secret-box";
import { listSonarrEpisodes } from "@/modules/service-connections/adapters/sonarr-episodes";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

export const dynamic = "force-dynamic";

type SonarrEpisodesBySeriesPageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{ returnTo?: string; title?: string; year?: string }>;
};

function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") ? value : "/sonarr";
}

export default async function SonarrEpisodesBySeriesPage({
  params,
  searchParams,
}: SonarrEpisodesBySeriesPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { seriesId: rawSeriesId } = await params;
  const seriesId = Number.parseInt(rawSeriesId, 10);

  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    redirect("/sonarr");
  }

  const resolvedSearchParams = await searchParams;
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo);
  const titleFromQuery = resolvedSearchParams?.title?.trim() ?? "";
  const yearFromQuery = resolvedSearchParams?.year?.trim() ?? "";
  const titleSuffix = yearFromQuery ? ` (${yearFromQuery})` : "";
  const headerTitle = titleFromQuery
    ? `Choose episodes for ${titleFromQuery}${titleSuffix}`
    : "Choose episodes for the new series";

  const connection = await findServiceConnectionByType(session.user.id, "sonarr");

  if (!connection?.secret || connection.connection.status !== "verified") {
    return (
      <div className="space-y-5">
        <Panel
          eyebrow="Sonarr"
          title={headerTitle}
          description="Sonarr verification is required before episodes can be loaded."
        >
          <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
            Re-verify Sonarr on the connections page, then return here to pick episodes.
          </p>
          <div className="mt-4">
            <Link
              href="/settings/connections"
              className="text-sm font-medium text-accent hover:underline"
            >
              Open Sonarr settings
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  const episodesResult = await listSonarrEpisodes({
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    seriesId,
  });

  return (
    <div className="space-y-5">
      <Panel
        eyebrow="Sonarr"
        title={headerTitle}
        description="The series was added to Sonarr without monitoring. Pick the episodes you want monitored and Sonarr will queue searches for them."
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={returnTo} className="text-muted hover:text-foreground">
            Cancel and return
          </Link>
        </div>
      </Panel>

      {episodesResult.ok ? (
        episodesResult.episodes.length > 0 ? (
          <RecommendationEpisodePicker
            episodes={episodesResult.episodes}
            action={submitSonarrEpisodeSelectionBySeriesAction}
            hiddenFields={[
              { name: "seriesId", value: seriesId },
              { name: "returnTo", value: returnTo },
            ]}
          />
        ) : (
          <Panel title="No episodes returned">
            <p className="text-sm leading-6 text-muted">
              Sonarr has not returned any episodes for this series yet. Wait a moment for the metadata
              refresh to finish, then reload this page.
            </p>
          </Panel>
        )
      ) : (
        <Panel title="Failed to load episodes">
          <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
            {episodesResult.message}
          </p>
        </Panel>
      )}
    </div>
  );
}
